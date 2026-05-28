const {
  Client,
  GatewayIntentBits,
  ChannelType,
  ActivityType
} = require('discord.js');

const fs = require('fs');

console.log("Starting Railway Backup Bot...");

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ================= DATABASE =================
const FILE = './backups.json';

let db = {
  backups: [],
  allowed: []
};

if (fs.existsSync(FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    console.log("Creating new database...");
  }
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

// ================= CONFIG =================
const OWNER_ID = process.env.OWNER_ID;
const TOKEN = process.env.TOKEN;

function isOwner(id) {
  return id === OWNER_ID || db.allowed.includes(id);
}

// ================= BACKUP =================
function createBackup(guild) {

  const categories = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildCategory)
    .map(cat => ({
      name: cat.name,
      position: cat.position
    }));

  const channels = guild.channels.cache
    .filter(c => c.type !== ChannelType.GuildCategory)
    .map(ch => ({
      name: ch.name,
      type: ch.type,
      parent: ch.parent ? ch.parent.name : null,
      position: ch.position,
      topic: ch.topic || null,
      nsfw: ch.nsfw || false,
      rateLimitPerUser: ch.rateLimitPerUser || 0
    }));

  const data = {
    id: db.backups.length + 1,
    name: guild.name,
    categories,
    channels,
    createdAt: Date.now()
  };

  db.backups.push(data);

  save();

  return data;
}

// ================= RESTORE =================
async function restore(guild, backup) {

  const createdCategories = {};

  // ===== CREATE CATEGORIES =====
  for (const cat of backup.categories.sort((a, b) => a.position - b.position)) {

    let existing = guild.channels.cache.find(
      c =>
        c.type === ChannelType.GuildCategory &&
        c.name === cat.name
    );

    if (!existing) {

      existing = await guild.channels.create({
        name: cat.name,
        type: ChannelType.GuildCategory
      }).catch(() => null);
    }

    if (existing) {
      createdCategories[cat.name] = existing;
    }
  }

  // ===== CREATE CHANNELS =====
  for (const ch of backup.channels.sort((a, b) => a.position - b.position)) {

    const exists = guild.channels.cache.find(
      c =>
        c.name === ch.name &&
        c.type === ch.type
    );

    if (exists) continue;

    let parentId = null;

    if (ch.parent && createdCategories[ch.parent]) {
      parentId = createdCategories[ch.parent].id;
    }

    await guild.channels.create({
      name: ch.name,
      type: ch.type,
      parent: parentId,
      topic: ch.topic || undefined,
      nsfw: ch.nsfw || false,
      rateLimitPerUser: ch.rateLimitPerUser || 0
    }).catch(() => {});
  }
}

// ================= READY =================
client.once('ready', () => {

  console.log(`Logged in as ${client.user.tag}`);

  console.log("📋 Servers:");

  client.guilds.cache.forEach(guild => {
    console.log(`${guild.name} | ${guild.id}`);
  });

  client.user.setActivity("Railway Backup", {
    type: ActivityType.Watching
  });

  console.log("Bot Ready On Railway");
});

// ================= COMMANDS =================
client.on('messageCreate', async (msg) => {

  if (!msg.guild || msg.author.bot) return;

  if (!isOwner(msg.author.id)) return;

  const args = msg.content.split(' ');

  const cmd = args[0].toLowerCase();

  // ===== BACKUP =====
  if (cmd === 'backup') {

    const b = createBackup(msg.guild);

    return msg.reply(
      `Backup saved\nID: ${b.id}\nCategories: ${b.categories.length}\nChannels: ${b.channels.length}`
    );
  }

  // ===== SETUP =====
  if (cmd === 'setup') {

    const b = db.backups.at(-1);

    if (!b) return msg.reply("No backup found");

    await restore(msg.guild, b);

    return msg.reply("Latest backup restored");
  }

  // ===== RESTORE =====
  if (cmd === 'restore') {

    const id = parseInt(args[1]);

    const b = db.backups.find(x => x.id === id);

    if (!b) return msg.reply("Backup not found");

    await restore(msg.guild, b);

    return msg.reply(`Backup #${id} restored`);
  }

  // ===== PREVIEW =====
  if (cmd === 'preview') {

    const b = db.backups.at(-1);

    if (!b) return msg.reply("No backups");

    return msg.reply(
      `Backup #${b.id}\nCategories: ${b.categories.length}\nChannels: ${b.channels.length}`
    );
  }

  // ===== HISTORY =====
  if (cmd === 'history') {

    return msg.reply(
      `Total backups: ${db.backups.length}`
    );
  }

  // ===== LOAD =====
  if (cmd === 'load') {

    const b = db.backups.at(-1);

    if (!b) return msg.reply("No backup");

    await restore(msg.guild, b);

    return msg.reply("Backup loaded");
  }

  // ===== ADD USER =====
  if (cmd === 'faddbackup') {

    const user = msg.mentions.users.first();

    if (!user) return msg.reply("Mention user");

    if (!db.allowed.includes(user.id)) {

      db.allowed.push(user.id);

      save();
    }

    return msg.reply("User added");
  }

  // ===== REMOVE USER =====
  if (cmd === 'fremovebackup') {

    const user = msg.mentions.users.first();

    if (!user) return msg.reply("Mention user");

    db.allowed = db.allowed.filter(x => x !== user.id);

    save();

    return msg.reply("User removed");
  }

  // ===== CLEAR BACKUPS =====
  if (cmd === 'krback') {

    db.backups = [];

    save();

    return msg.reply("All backups deleted");
  }

  // ===== STATS =====
  if (cmd === 'stats') {

    return msg.reply(
      `Servers: ${client.guilds.cache.size}\nChannels: ${msg.guild.channels.cache.size}\nBackups: ${db.backups.length}`
    );
  }

  // ===== SERVERS =====
  if (cmd === 'servers') {

    const list = client.guilds.cache.map(
      g => `${g.name} | ${g.id}`
    ).join('\n');

    return msg.reply(`Servers:\n${list}`);
  }
});

// ================= LOGIN =================
if (!TOKEN) {
  console.log("TOKEN NOT FOUND IN RAILWAY VARIABLES");
  process.exit(1);
}

const TOKEN = process.env.TOKEN;
