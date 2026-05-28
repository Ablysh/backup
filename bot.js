const {
  Client,
  GatewayIntentBits,
  ChannelType,
  ActivityType,
  EmbedBuilder
} = require('discord.js');

const fs = require('fs');

console.log("Backup System Running...");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const FILE = './backups.json';

let db = {
  backups: [],
  allowed: [],
  deleted: {
    channels: 0,
    categories: 0,
    roles: 0
  }
};

if (fs.existsSync(FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    console.log("DB corrupted, resetting...");
  }
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

const OWNER_ID = "1497177808211017728";

function isOwner(id) {
  return id === OWNER_ID || db.allowed.includes(id);
}

// ================= BACKUP =================
function createBackup(guild, mode = "all") {
  const data = {
    id: db.backups.length + 1,
    name: guild.name,
    createdAt: Date.now(),
    channels: [],
    roles: []
  };

  if (mode === "all" || mode === "c") {
    data.channels = guild.channels.cache.map(c => ({
      name: c.name,
      type: c.type,
      parent: c.parent ? c.parent.name : null
    }));
  }

  if (mode === "all" || mode === "r") {
    data.roles = guild.roles.cache
      .filter(r => r.name !== "@everyone")
      .map(r => ({
        name: r.name,
        color: r.color,
        permissions: r.permissions.bitfield.toString()
      }));
  }

  db.backups.push(data);
  save();
  return data;
}

// ================= RESTORE =================
async function restore(guild, backup, mode = "all") {

  if (!backup) return;

  // CHANNELS
  if (mode === "all" || mode === "c") {
    for (const ch of backup.channels || []) {

      if (!ch?.name) continue;

      const exists = guild.channels.cache.find(c => c.name === ch.name);
      if (exists) continue;

      await guild.channels.create({
        name: ch.name,
        type: ch.type ?? ChannelType.GuildText
      }).catch(() => {});
    }
  }

  // ROLES
  if (mode === "all" || mode === "r") {
    for (const role of backup.roles || []) {

      if (!role?.name) continue;

      const exists = guild.roles.cache.find(r => r.name === role.name);
      if (exists) continue;

      await guild.roles.create({
        name: role.name,
        color: role.color || null
      }).catch(() => {});
    }
  }
}

// ================= READY =================
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setActivity("Backup System Pro", {
    type: ActivityType.Watching
  });
});

// ================= COMMANDS =================
client.on('messageCreate', async (msg) => {

  if (!msg.guild || msg.author.bot) return;
  if (!isOwner(msg.author.id)) return;

  const args = msg.content.trim().split(/ +/);
  const cmd = args[0].toLowerCase();

  // ================= BACKUP =================
  if (cmd === 'backup') {
    const type = args[1] || "all";
    const b = createBackup(msg.guild, type);
    return msg.reply(`Backup #${b.id} saved (${type})`);
  }

  // ================= LOAD =================
  if (cmd === 'load') {
    const type = args[1] || "all";
    const b = db.backups.at(-1);

    if (!b) return msg.reply("No backup found");

    await restore(msg.guild, b, type);
    return msg.reply(`Loaded backup (${type})`);
  }

  // ================= SETUP =================
  if (cmd === 'setup') {
    const b = db.backups.at(-1);
    if (!b) return msg.reply("No backup found");

    await restore(msg.guild, b, "all");
    return msg.reply("Latest backup restored");
  }

  // ================= PREVIEW =================
  if (cmd === 'preview') {
    const b = db.backups.at(-1);
    if (!b) return msg.reply("No backups");

    return msg.reply(
      `Backup #${b.id}\nChannels: ${b.channels.length}\nRoles: ${b.roles.length}`
    );
  }

  // ================= HISTORY =================
  if (cmd === 'history') {
    return msg.reply(`Total backups: ${db.backups.length}`);
  }

  // ================= COMPARE =================
  if (cmd === 'compare') {
    const a = db.backups.find(x => x.id === parseInt(args[1]));
    const b = db.backups.find(x => x.id === parseInt(args[2]));

    if (!a || !b) return msg.reply("Invalid backups");

    return msg.reply(
      `A: ${a.channels.length} channels | ${a.roles.length} roles\nB: ${b.channels.length} channels | ${b.roles.length} roles`
    );
  }

  // ================= ADD =================
  if (cmd === 'faddbackup') {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention user");

    if (!db.allowed.includes(user.id)) db.allowed.push(user.id);
    save();

    return msg.reply("User added");
  }

  // ================= REMOVE =================
  if (cmd === 'fremovebackup') {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention user");

    db.allowed = db.allowed.filter(x => x !== user.id);
    save();

    return msg.reply("User removed");
  }

  // ================= KRBACK =================
  if (cmd === 'krback') {
    db.backups = [];
    save();
    return msg.reply("All backups cleared");
  }

  // ================= STATS (FIXED + SAFE) =================
  if (cmd === 'stats') {

    const guild = msg.guild;

    const embed = new EmbedBuilder()
      .setTitle("BACKUP SYSTEM STATUS")
      .setColor(0x00ffcc)
      .addFields(
        { name: "Owner", value: OWNER_ID, inline: true },
        { name: "Backups", value: String(db.backups.length), inline: true },
        { name: "Channels", value: String(guild.channels.cache.size), inline: true },
        { name: "Roles", value: String(guild.roles.cache.size), inline: true },
        { name: "Allowed Users", value: String(db.allowed.length), inline: true }
      )
      .setTimestamp();

    return msg.reply({ embeds: [embed] });
  }

});

client.login(process.env.TOKEN);
