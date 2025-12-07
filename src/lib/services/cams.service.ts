// const inputFile: File = new File([await this.getAttachmentBuffer(attachments[0])], attachments[0].name || 'unknown', {
// 	type: attachments[0].contentType || 'application/octet-stream'
// });

// const file = this.container.appwriteStorageClient.createFile({
// 	bucketId: process.env.APPWRITE_BUCKET_ID,
// 	fileId: fileId,
// 	file: arrayBuffer
// });

// const watermarkText = `${encodeId(interaction.user.id)}#${encodeId(Date.now().toString())}`;

// const bobClient = this.container.blobContainerClient.getBlockBlobClient(watermarkText);
// await bobClient.uploadData(await this.getAttachmentBuffer(attachments[0]));

// const { url } = bobClient;

// const msg = await interaction.editReply(`Created Job ID: **${watermarkText}**\n${url}`);

// const job = newJobSchema.parse({
// 	container: bobClient.containerName,
// 	jobId: watermarkText,
// 	type: validImageTypes.includes(attachments[0].contentType || '') ? 'image' : 'video',
// 	filename: attachments[0].name || 'unknown',
// 	responseUrl: `${process.env.LOCAL_API_ENDPOINT}/cams`,
// 	watermarkText,
// 	interaction: {
// 		applicationId: interaction.applicationId,
// 		token: interaction.token,
// 		messageId: msg.id
// 	}
// });

// await watermarkQueue.add('watermark', job, {
// 	jobId: watermarkText
// });
