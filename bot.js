const {
  Client,
  GatewayIntentBits,
  ChannelType,
  ActivityType
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
  allowed: []
};

if (fs.existsSync(FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {}
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

const OWNER_ID = "1497177808211017728";

function isOwner(id) {
  return id === OWNER_ID || db.allowed.includes(id);
}

// ================= BACKUP =================
function createBackup(guild) {
  const data = {
    id: db.backups.length + 1,
    name: guild.name,
    channels: guild.channels.cache.map(c => ({
      name: c.name,
      type: c.type,
      parent: c.parent ? c.parent.name : null
    })),
    createdAt: Date.now()
  };

  db.backups.push(data);
  save();
  return data;
}

// ================= RESTORE =================
async function restore(guild, backup) {
  for (const ch of backup.channels) {
    const exists = guild.channels.cache.find(c => c.name === ch.name);

    if (!exists) {
      await guild.channels.create({
        name: ch.name,
        type: ch.type
      }).catch(() => {});
    }
  }
}

// ================= READY =================
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setActivity("Backup System", {
    type: ActivityType.Watching
  });
});

// ================= COMMANDS =================
client.on('messageCreate', async (msg) => {
  if (!msg.guild || msg.author.bot) return;
  if (!isOwner(msg.author.id)) return;

  const args = msg.content.split(' ');
  const cmd = args[0].toLowerCase();

  // ================= BACKUP =================
  if (cmd === 'backup') {
    const b = createBackup(msg.guild);
    return msg.reply(`Backup saved #${b.id}`);
  }

  // ================= SETUP (latest restore) =================
  if (cmd === 'setup') {
    const b = db.backups.at(-1);
    if (!b) return msg.reply("No backup found");

    await restore(msg.guild, b);
    return msg.reply("Latest backup restored");
  }

  // ================= RESTORE BY ID =================
  if (cmd === 'restore') {
    const id = parseInt(args[1]);
    const b = db.backups.find(x => x.id === id);

    if (!b) return msg.reply("Backup not found");

    await restore(msg.guild, b);
    return msg.reply(`Restored backup #${id}`);
  }

  // ================= PREVIEW =================
  if (cmd === 'preview') {
    const b = db.backups.at(-1);
    if (!b) return msg.reply("No backups");

    return msg.reply(
      `Backup #${b.id}\nChannels: ${b.channels.length}`
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
      `A: ${a.channels.length} channels\nB: ${b.channels.length} channels`
    );
  }

  // ================= ADD USER =================
  if (cmd === 'faddbackup') {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention user");

    if (!db.allowed.includes(user.id)) {
      db.allowed.push(user.id);
      save();
    }

    return msg.reply("User added");
  }

  // ================= REMOVE USER =================
  if (cmd === 'fremovebackup') {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("Mention user");

    db.allowed = db.allowed.filter(x => x !== user.id);
    save();

    return msg.reply("User removed");
  }

  // ================= LOAD (no delete restore) =================
  if (cmd === 'load') {
    const b = db.backups.at(-1);
    if (!b) return msg.reply("No backup");

    await restore(msg.guild, b);
    return msg.reply("Loaded without deleting existing channels");
  }

  // ================= KRBACK (clear backups) =================
  if (cmd === 'krback') {
    db.backups = [];
    save();
    return msg.reply("All backups deleted");
  }

  // ================= STATS =================
  if (cmd === 'stats') {
    const guild = msg.guild;

    const missing = guild.channels.cache.size;

    return msg.reply(
      `Owner: ${OWNER_ID}\nChannels: ${guild.channels.cache.size}\nBackups: ${db.backups.length}`
    );
  }
});

client.login(process.env.TOKEN);
