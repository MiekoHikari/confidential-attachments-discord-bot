# Confidential Attachments Discord Bot (CADS)
A Discord bot built for closed off communities for sharing media files securely through watermarking, access tracking and tracing. Built with Typescript, Sapphire Framework, and Appwrite.

A Discord bot that enables secure sharing of media files with automatic watermarking and access tracking. Built with TypeScript, Sapphire Framework, Appwrite, and Azure Blob Storage this bot ensures confidential media stays within your server community.

# Features
- **Secure Media Uploads** - Upload images and videos up to 499.9 MB
- **Automatic Watermarking** - Every file view generates a unique watermark with viewer information
- **Access Tracking** - Complete audit logs of who viewed what and when
- **Async Job Processing** - BullMQ-powered queue system for handling large files
- **Hybrid Storage** - Appwrite for metadata, Azure Blob Storage for processed files

## Supported File Types

### Images
- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- GIF (`.gif`)

### Videos
- MP4 (`.mp4`)
- QuickTime (`.mov`)
- Matroska (`.mkv`)

**Maximum file size:** 499.9 MB per file

## Prerequisites

- Node.js 18.x or higher
- pnpm 8.x or higher
- Discord Bot Token
- Appwrite Cloud account (or self-hosted instance)
- Azure Storage Account
- Redis-compatible database (for BullMQ)
- Confidential Attachments Media Server (CAMS)

## Installation
1. Clone this repository
```
git clone https://github.com/MiekoHikari/confidential-attachments-discord-bot.git
cd confidential-attachments-discord-bot
```
2. Install Dependencies
```
pnpm install
```
3. Configure Appwrite Tables and Buckets
You can use the appwrite CLI to make this process faster. View more here: https://appwrite.io/docs/tooling/command-line/installation
4. Setup Environment Variables
Copy the .env template from src and rename it to .env.local (or .env.production choose whatever you like) and fill it out like a form!
5. Build and start!
```
pnpm build
node dist/index.js
```

## Architecture

### Technology Stack
- **Framework:** [Sapphire Framework](https://www.sapphirejs.dev/) (Discord.js wrapper)
- **Language:** TypeScript with SWC compiler
- **Backend:** Appwrite Cloud (Database + Storage)
- **Queue:** BullMQ with Redis
- **Blob Storage:** Azure Blob Storage
- **Media Processing:** Confidential Attachments Media Server (CAMS)

### Database Schema

#### Media Items
Stores uploaded file metadata:
- `storageFileId` - Appwrite storage reference
- `guildId`, `channelId`, `messageId` - Discord context
- `authorId` - Uploader's Discord ID
- `type` - `image` or `video`
- `hash` - File hash for deduplication
- `sizeBytes` - Original file size

#### Access Logs
Tracks every file access:
- `viewerId` - Discord user who viewed the file
- `accessType` - `first_time` or `repeat_view`
- `completedJob` - Reference to watermarked file

#### Completed Jobs
Links BullMQ jobs to processed files:
- `jobId` - BullMQ job identifier
- Relationships to `media_items` and `access_logs`

## Usage

### Upload Command
```
/upload (file1:Discord Attachment) [file2-10:Discord Attachment]
```
- Upload upto 10 files at once just like discord
- File validation

When the user runs this command, the file is validated by the bot before passing it onto Appwrite Storage and TablesDB. Once upload has been confirmed, a message is sent within the same discord channel where the command was run from. The message contains buttons to which the users can access the files.

### Viewing Files

When a user clicks a button from an upload message, their access is logged based on whether its their first time viewing or not. To prevent overloading the media server, users can retrieve the same processed job multiple times within a 7 day period. 

Watermarks will always be unique as they are formatted as follows:
```
<Encoded User ID>#<Encoded Job Timestamp>
```

### API Endpoints

The bot listens to port 4000. It currently only hosts 1 endpoint which is `/metrics`. This endpoint is to help azure container scalers to scale based on total pending jobs list.

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Run `pnpm format` before committing
4. Submit a pull request with detailed description

## License

[AGPL-3.0-only](LICENSE)

## Author

[@miekohikari](https://github.com/MiekoHikari)

## Support

For issues, questions, or feature requests, please [open an issue](https://github.com/MiekoHikari/confidential-attachments-discord-bot/issues).

---

**⚠️ Important:** This bot is designed for closed communities. Never share watermarked files outside your server, as they contain identifying information.
