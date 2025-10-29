 const express = require('express');
 const http = require('http');
 const socketIo = require('socket.io');
 const multer = require('multer');
 const path = require('path');
 const fs = require('fs');
 const cors = require('cors');
 const { v4: uuidv4 } = require('uuid');

 const app = express();
 const server = http.createServer(app);
 const io = socketIo(server, {
   cors: {
     origin: "*",
     methods: ["GET", "POST"]
   }
 });

 // Middleware
 app.use(cors());
 app.use(express.json());
 app.use(express.static(path.join(__dirname, '../frontend')));

 // Ensure uploads directory exists
 const uploadsDir = path.join(__dirname, 'uploads');
 if (!fs.existsSync(uploadsDir)) {
   fs.mkdirSync(uploadsDir);
 }

 // Configure multer for file uploads
 const storage = multer.diskStorage({
   destination: (req, file, cb) => {
     cb(null, uploadsDir);
   },
   filename: (req, file, cb) => {
     cb(null, `${uuidv4()}-${file.originalname}`);
   }
 });

 const upload = multer({ storage });

 // Store active transfers and file metadata
 const activeTransfers = {};
 const fileMetadata = {};
 const clientFiles = {}; // Track which files each client has received
 const tempStorage = {}; // Temporary storage for files before transfer

 // Routes
 app.post('/api/upload', upload.single('file'), (req, res) => {
   if (!req.file) {
     return res.status(400).json({ success: false, message: 'No file uploaded' });
   }

   const fileId = req.file.filename;
   const fileInfo = {
     id: fileId,
     name: req.file.originalname,
     size: req.file.size,
     path: req.file.path,
     mimeType: req.file.mimetype,
     uploadTime: new Date().toISOString()
   };

   // Store file metadata
   fileMetadata[fileId] = fileInfo;

   // Store file in temporary storage
   tempStorage[fileId] = {
     fileInfo,
     buffer: fs.readFileSync(req.file.path),
     expiryTime: Date.now() + (24 * 60 * 60 * 1000) // 24 hours expiry
   };

   // Set up automatic cleanup
   setTimeout(() => {
     if (tempStorage[fileId]) {
       delete tempStorage[fileId];
       console.log(`Removed expired file from temp storage: ${fileId}`);
     }
   }, 24 * 60 * 60 * 1000);

   res.json({ success: true, fileInfo });
 });

 // Endpoint to check if a client has a specific file
 app.get('/api/has-file/:fileId/:clientId', (req, res) => {
   const fileId = req.params.fileId;
   const clientId = req.params.clientId;

   const hasFile = clientFiles[clientId] && clientFiles[clientId].includes(fileId);

   res.json({
     success: true,
     hasFile,
     fileInfo: hasFile ? fileMetadata[fileId] : null
   });
 });

 // Endpoint for viewing files (non-downloadable)
 app.get('/api/view/:fileId/:clientId', (req, res) => {
   const fileId = req.params.fileId;
   const clientId = req.params.clientId;

   // Check if file exists in temporary storage
   if (tempStorage[fileId]) {
     const { buffer, fileInfo } = tempStorage[fileId];

     // Set headers to prevent downloading
     res.setHeader('Content-Type', fileInfo.mimeType);
     res.setHeader('Content-Disposition', 'inline');
     res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'none';");
     res.setHeader('X-Content-Type-Options', 'nosniff');
     res.setHeader('Cache-Control', 'no-store');
     res.setHeader('Pragma', 'no-cache');

     // Send the file buffer
     res.send(buffer);
     return;
   }

   // If not in temp storage, check if file exists on disk
   const filePath = path.join(uploadsDir, fileId);
   if (!fs.existsSync(filePath)) {
     return res.status(404).json({ success: false, message: 'File not found' });
   }

   const fileInfo = fileMetadata[fileId];
   if (!fileInfo) {
     return res.status(404).json({ success: false, message: 'File metadata not found' });
   }

   // Check if client already has this file
   if (clientFiles[clientId] && clientFiles[clientId].includes(fileId)) {
     return res.status(200).json({
       success: true,
       alreadyDownloaded: true,
       fileInfo: fileInfo
     });
   }

   // Set headers to prevent downloading
   res.setHeader('Content-Type', fileInfo.mimeType);
   res.setHeader('Content-Disposition', 'inline');
   res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'none';");
   res.setHeader('X-Content-Type-Options', 'nosniff');
   res.setHeader('Cache-Control', 'no-store');
   res.setHeader('Pragma', 'no-cache');

   // Create read stream and pipe it to the response
   const readStream = fs.createReadStream(filePath);
   readStream.pipe(res);
 });

 // Socket.IO for real-time file transfer
 io.on('connection', (socket) => {
   console.log('New client connected');

   // Initialize client files tracking
   if (!clientFiles[socket.id]) {
     clientFiles[socket.id] = [];
   }

   // Handle sender starting a transfer
   socket.on('start-transfer', (data) => {
     const { fileId, receiverId } = data;

     // Check if file exists in temporary storage
     if (tempStorage[fileId]) {
       const { buffer, fileInfo } = tempStorage[fileId];

       // Check if receiver already has the file
       if (clientFiles[receiverId] && clientFiles[receiverId].includes(fileId)) {
         socket.emit('transfer-complete', { alreadyDownloaded: true });
         return;
       }

       // Notify receiver about incoming file
       io.to(receiverId).emit('transfer-started', {
         fileInfo: fileInfo,
         savePath: 'Received Files',
         isFromTempStorage: true
       });

       // Send the entire file at once from temp storage
       io.to(receiverId).emit('file-data', {
         fileId,
         data: buffer.toString('base64'),
         fileInfo: fileInfo,
         progress: 100
       });

       // Track that this client now has the file
       if (!clientFiles[receiverId]) {
         clientFiles[receiverId] = [];
       }
       if (!clientFiles[receiverId].includes(fileId)) {
         clientFiles[receiverId].push(fileId);
       }

       // Notify both parties that transfer is complete
       socket.emit('transfer-complete');
       io.to(receiverId).emit('transfer-complete', {
         fileInfo: fileInfo,
         savePath: 'Received Files',
         saveToFile: true
       });

       return;
     }

     // If not in temp storage, proceed with regular file streaming
     const filePath = path.join(uploadsDir, fileId);

     if (!fs.existsSync(filePath)) {
       socket.emit('transfer-error', { message: 'File not found' });
       return;
     }

     const stats = fs.statSync(filePath);
     const fileInfo = fileMetadata[fileId];

     // Store transfer info
     activeTransfers[socket.id] = {
       fileId,
       receiverId,
       filePath,
       sentBytes: 0
     };

     // Check if receiver already has the file
     if (clientFiles[receiverId] && clientFiles[receiverId].includes(fileId)) {
       socket.emit('transfer-complete', { alreadyDownloaded: true });
       delete activeTransfers[socket.id];
       return;
     }

     // Notify receiver about incoming file
     io.to(receiverId).emit('transfer-started', {
       fileInfo: fileInfo,
       savePath: 'Received Files',
       isFromTempStorage: false
     });

     // Start sending file in chunks
     const readStream = fs.createReadStream(filePath);
     let chunkSize = 1024 * 64; // 64KB chunks
     let buffer = Buffer.alloc(0);

     readStream.on('data', (chunk) => {
       buffer = Buffer.concat([buffer, chunk]);

       while (buffer.length >= chunkSize) {
         const chunkToSend = buffer.slice(0, chunkSize);
         buffer = buffer.slice(chunkSize);

         // Send chunk to receiver
         io.to(receiverId).emit('file-chunk', {
           fileId,
           chunk: chunkToSend.toString('base64'),
           progress: Math.min(100, Math.round((activeTransfers[socket.id].sentBytes / stats.size) * 100))
         });

         activeTransfers[socket.id].sentBytes += chunkToSend.length;

         // Update sender progress
         socket.emit('transfer-progress', {
           progress: Math.min(100, Math.round((activeTransfers[socket.id].sentBytes / stats.size) * 100))
         });
       }
     });

     readStream.on('end', () => {
       // Send any remaining data
       if (buffer.length > 0) {
         io.to(receiverId).emit('file-chunk', {
           fileId,
           chunk: buffer.toString('base64'),
           progress: 100
         });
       }

       // Track that this client now has the file
       if (!clientFiles[receiverId]) {
         clientFiles[receiverId] = [];
       }
       if (!clientFiles[receiverId].includes(fileId)) {
         clientFiles[receiverId].push(fileId);
       }

       // Notify both parties that transfer is complete
       socket.emit('transfer-complete');
       io.to(receiverId).emit('transfer-complete', {
         fileInfo: fileInfo,
         savePath: 'Received Files',
         saveToFile: true
       });

       // Clean up
       delete activeTransfers[socket.id];
     });

     readStream.on('error', (err) => {
       console.error('Error reading file:', err);
       socket.emit('transfer-error', { message: 'Error reading file' });
       io.to(receiverId).emit('transfer-error', { message: 'Error transferring file' });
       delete activeTransfers[socket.id];
     });
   });

   // Handle receiver joining a room
   socket.on('join-room', (roomId) => {
     socket.join(roomId);
     console.log(`Client joined room: ${roomId}`);

     // Notify others in the room
     socket.to(roomId).emit('user-joined', socket.id);
   });

   // Handle client checking if they have a file
   socket.on('check-file', (data) => {
     const { fileId } = data;
     const hasFile = clientFiles[socket.id] && clientFiles[socket.id].includes(fileId);
     socket.emit('file-check-result', {
       fileId,
       hasFile,
       fileInfo: hasFile ? fileMetadata[fileId] : null
     });
   });

   // Handle client confirming file save
   socket.on('file-saved', (data) => {
     const { fileId } = data;
     console.log(`Client ${socket.id} confirmed saving file ${fileId}`);
   });

   // Handle disconnection
   socket.on('disconnect', () => {
     console.log('Client disconnected');
     if (activeTransfers[socket.id]) {
       io.to(activeTransfers[socket.id].receiverId).emit('transfer-cancelled');
       delete activeTransfers[socket.id];
     }
   });
 });

 const PORT = process.env.PORT || 3000;
 server.listen(PORT, () => {
   console.log(`Server running on port ${PORT}`);
 });