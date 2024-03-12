const Redis = require("ioredis");
const redisClient = new Redis();

const cluster = require('node:cluster');
const http = require('node:http');
const os = require('node:os');
const numCPUs = os.cpus().length;
const process = require('node:process');
const { setupMaster, setupWorker } = require("@socket.io/sticky");
const { createAdapter, setupPrimary } = require("@socket.io/cluster-adapter");
const { Server } = require("socket.io");
const express = require("express");

const app = express();

if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);

    const httpServer = http.createServer(app);
    httpServer.listen(3001);

    setupMaster(httpServer, { loadBalancingMethod: "least-connection" });

    setupPrimary();
    cluster.setupPrimary({
        serialization: "advanced"
    });

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
} else {
    console.log(`Worker ${process.pid} started`);

    const httpServer = http.createServer(app);
    const io = new Server(httpServer);

    io.adapter(createAdapter());

    setupWorker(io);

    io.on("connection", async (socket) => {
        console.log(`Worker ${process.pid} received connection`);

        // Fetching all the messages from redis
        const existingMessages = await redisClient.lrange("chat_messages", 0, -1);

        // Parsing the messages to JSON
        const parsedMessages = existingMessages.map((item) => JSON.parse(item));

        // Sending all the messages to the user
        socket.emit("historical_messages", parsedMessages);

        socket.on("message", (data) => {
            console.log(`Message arrived at ${process.pid}:`, data);
            redisClient.lpush("chat_messages", JSON.stringify(data));
            io.emit("message", data); // Send message to all connected clients
        });
    });

    const path = require('path');

    // Serve static files
    app.use(express.static(path.join(__dirname, 'public')));

    // Inicio
    app.get("/", (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });


    const server = httpServer.listen(3000, () => {
        console.log(`Server listening on port ${server.address().port}`);
    });
}
