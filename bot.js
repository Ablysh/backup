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
    return msg.channel.send(`✅ Backup #${b.id} saved (${type})`);
  }

  // ================= LOAD =================
  if (cmd === 'load') {
    const type = args[1] || "all";
    const b = db.backups.at(-1);

    if (!b) return msg.channel.send("❌ No backup found.");

    await msg.channel.send(`⏳ Loading backup #${b.id} (${type})...`);
    await restore(msg.guild, b, type);
    return msg.channel.send(`✅ Backup #${b.id} loaded successfully (${type}).`);
  }

  // ================= SETUP =================
  if (cmd === 'setup') {
    const id = parseInt(args[1]);
    const b = id ? db.backups.find(x => x.id === id) : db.backups.at(-1);

    if (!b) return msg.channel.send("❌ No backup found.");

    await msg.channel.send(`⏳ Setting up backup #${b.id}...`);
    await restore(msg.guild, b, "all");
    return msg.channel.send(`✅ Backup #${b.id} fully restored.`);
  }

  // ================= PREVIEW =================
  if (cmd === 'preview') {
    const b = db.backups.at(-1);
    if (!b) return msg.channel.send("❌ No backups found.");

    return msg.channel.send(
      `📦 Backup #${b.id}\nChannels: ${b.channels.length}\nRoles: ${b.roles.length}`
    );
  }

  // ================= HISTORY =================
  if (cmd === 'history') {
    return msg.channel.send(`📋 Total backups: ${db.backups.length}`);
  }

  // ================= COMPARE =================
  if (cmd === 'compare') {
    const a = db.backups.find(x => x.id === parseInt(args[1]));
    const b = db.backups.find(x => x.id === parseInt(args[2]));

    if (!a || !b) return msg.channel.send("❌ Invalid backup IDs.");

    return msg.channel.send(
      `🔍 Backup #${a.id}: ${a.channels.length} channels | ${a.roles.length} roles\n` +
      `🔍 Backup #${b.id}: ${b.channels.length} channels | ${b.roles.length} roles`
    );
  }

  // ================= ADD =================
  if (cmd === 'faddbackup') {
    const user = msg.mentions.users.first();
    if (!user) return msg.channel.send("❌ Mention a user.");

    if (!db.allowed.includes(user.id)) db.allowed.push(user.id);
    save();
    return msg.channel.send(`✅ <@${user.id}> added to allowed users.`);
  }

  // ================= REMOVE =================
  if (cmd === 'fremovebackup') {
    const user = msg.mentions.users.first();
    if (!user) return msg.channel.send("❌ Mention a user.");

    db.allowed = db.allowed.filter(x => x !== user.id);
    save();
    return msg.channel.send(`✅ <@${user.id}> removed from allowed users.`);
  }

  // ================= KRBACK =================
  if (cmd === 'krback') {
    db.backups = [];
    save();
    return msg.channel.send("🗑️ All backups cleared.");
  }

  // ================= STATS =================
  if (cmd === 'stats') {
    const guild = msg.guild;
    const last = db.backups.at(-1);

    const embed = new EmbedBuilder()
      .setTitle("📦 Backup System Status")
      .setColor(0x00ffcc)
      .addFields(
        { name: "🔑 Owner", value: `<@${OWNER_ID}>`, inline: true },
        { name: "💾 Total Backups", value: String(db.backups.length), inline: true },
        { name: "👥 Allowed Users", value: String(db.allowed.length), inline: true },
        { name: "📢 Channels", value: String(guild.channels.cache.size), inline: true },
        { name: "🎭 Roles", value: String(guild.roles.cache.size), inline: true },
        { name: "🕐 Last Backup", value: last ? `#${last.id} — <t:${Math.floor(last.createdAt / 1000)}:R>` : "None", inline: true }
      )
      .setFooter({ text: `Server: ${guild.name}` })
      .setTimestamp();

    return msg.channel.send({ embeds: [embed] });
  }

});

client.login(process.env.TOKEN);
