const {
  Client,
  GatewayIntentBits,
  ChannelType,
  ActivityType
} = require('discord.js');

const fs = require('fs');

console.log("Premium Backup Bot Running...");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const FILE = './backups.json';

let errorCount = 0;
let totalBackupsCount = 0;
let backupInterval = null;

// ================= FILE & DATABASE =================
function loadData() {
  if (!fs.existsSync(FILE)) {
    return {
      backups: [],
      deleted: {
        channels: [],
        categories: []
      }
    };
  }

  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    errorCount++;
    return {
      backups: [],
      deleted: {
        channels: [],
        categories: []
      }
    };
  }
}

let db = loadData();

function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    errorCount++;
  }
}

// ================= OWNER =================
const OWNER_ID = "1497177808211017728";

function isOwner(id, guild) {
  return id === OWNER_ID || (guild && id === guild.ownerId);
}

// ================= BACKUP =================
function createBackup(guild) {
  const data = {
    id: Date.now(),
    name: guild.name,

    channels: guild.channels.cache.map(c => ({
      name: c.name,
      type: c.type,
      parent: c.parent ? c.parent.name : null,
      position: c.position
    })),

    createdAt: Date.now()
  };

  db.backups = [data];
  save();

  totalBackupsCount++;
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
  try {
    if (!msg.guild || msg.author.bot) return;
    if (!isOwner(msg.author.id, msg.guild)) return;

    const args = msg.content.split(' ');
    const cmd = args[0].toLowerCase();

    // BACKUP
    if (cmd === 'backup') {
      createBackup(msg.guild);
      return msg.reply("Backup saved successfully.");
    }

    // CHECK
    if (cmd === 'check') {
      const last = db.backups.at(-1);
      if (!last) return msg.reply("No backups found.");

      return msg.reply(`Latest Backup: ${last.name}`);
    }

    // RESTORE
    if (cmd === 'restore') {
      const backup = db.backups.at(-1);
      if (!backup) return msg.reply("No backup found.");

      await restore(msg.guild, backup);
      return msg.reply("Backup restored successfully.");
    }

    // STATS
    if (cmd === 'stats') {
      return msg.reply(
        `Backups: ${db.backups.length}\nErrors: ${errorCount}`
      );
    }

  } catch (err) {
    errorCount++;
    console.log(err);
    return msg.reply("An internal error occurred.");
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);