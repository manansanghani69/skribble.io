const express = require("express");
var http = require("http");
const app = express();
const port = process.env.PORT || 3000;
var server = http.createServer(app);
const mongoose = require("mongoose");
const Room = require('./models/Room');
const getWord = require('./api/getWord');

var io = require("socket.io")(server);

//middleware
app.use(express.json());

const DB = 'mongodb+srv://manansanghani123:D2puHRzFNHL30WDd@cluster0.ywdojee.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'

mongoose.connect(DB).then(()=>{
    console.log("connected successfully to MongoDB");
}).catch((e)=>{
    console.log(e);
})

io.on('connection', (socket) => {
    console.log('connected successfully to socket');

    //on creating the room
    socket.on('create-game', async({nickname,name,occupancy,maxRounds}) => {
        try{
            const existingRoom = await Room.findOne({name});

            // room already exists
            if(existingRoom){
                console.log('Room with that name already exists:', name);
                socket.emit('notCorrectGame' , 'room with that name already exists!');
                return;
            }

            //making new room
            let room = new Room();
            const word = getWord();
            room.word = word;
            room.name = name;
            room.occupancy = occupancy;
            room.maxRounds = maxRounds;

            let player = {
                socketID : socket.id,
                nickname,
                isPartyLeader: true,
            }
            room.players.push(player);
            console.log('Saving room:', room);

            room = await room.save();
            socket.join(name);
            io.to(name).emit('updateRoom', room);
        }catch (e){
            console.log(e);
        }
    });

    //on joining the room
    socket.on('join-game', async({nickname, name}) => {
        try {
            let room = await Room.findOne({name});

            //room doesn't exists
            if(!room){
                console.log("Room not found");
                socket.emit('notCorrectGame' , 'please enter the valid room name');
                return;
            }

            //joining room
            if(room.isJoin){
                let player = {
                    socketID: socket.id,
                    nickname,
                };
                room.players.push(player);
                console.log('updating room:', room);

                socket.join(name);

                //room occupancy
                if(room.players.length >= room.occupancy){
                    room.isJoin = false;
                }
                room.turn = room.players[room.turnIndex];
                room = await room.save();
                io.to(name).emit('updateRoom', room);
            }else{
                console.log("room is already full");
                socket.emit('notCorrectGame' , 'room is already full');
            }
        } catch (e){
            console.log(e);
        }
    });

//white board sockets
    //on painting the screen
    socket.on('paint', ({details, roomName}) => {
        io.to(roomName).emit('points', {details:details});
    });

    //on changing the color
    socket.on('color-change', ({color, roomName})=>{
        io.to(roomName).emit('color-change', color);
    });

    //on changing the stroke width
    socket.on('stroke-width', ({value, roomName})=>{
        io.to(roomName).emit('stroke-width', value);
    });

    //clear screen socket
    socket.on('clear-screen', (roomName)=>{
        io.to(roomName).emit('clear-screen', '');
    });

    //on message sent
    socket.on('msg', async (data) => {
        console.log(data);
        try{
            if(data.msg === data.word){
                let room = await Room.find({name: data.roomName});
                let userPlayer = room[0].players.filter(
                    (player) => player.nickname == data.username
                );
                if (data.timeTaken !== 0){
                    userPlayer[0].points += Math.round((200/data.timeTaken) * 10);
                }
                room = await room[0].save();
                io.to(data.roomName).emit('msg',{
                    userName: data.username,
                    msg: 'Guessed it!',
                    guessedUserCtr : data.guessedUserCtr + 1,
                });
                socket.emit('close-input', '');
            }else{
                io.to(data.roomName).emit('msg',{
                    userName: data.username,
                    msg: data.msg,
                    guessedUserCtr : data.guessedUserCtr,
                });
            }
        }catch (e){
            console.log(e.toString());
        }
    });

    //on changing the turn
    socket.on('change-turn', async (name)=>{
       try{
           let room = await Room.findOne({name});
           let idx = room.turnIndex;
           if (idx+1 === room.players.length){
               room.currentRound += 1;
           }
           if (room.currentRound <= room.maxRounds){
               const word = getWord();
               room.word = word;
               room.turnIndex = (idx+1) % room.players.length;
               room.turn = room.players[room.turnIndex];
               room = await room.save();
               io.to(name).emit('change-turn', room);
           }else{
               io.to(name).emit('show-leaderboard', room.players);
           }
       } catch (e){
           console.log(e);
       }
    });

    //updating the score
    socket.on('update-score', async (name)=>{
        try{
            const room = await Room.find({name});
            io.to(name).emit('update-score', room);
        }catch (e){
            console.log(e);
        }
    });

    //disconnecting the socket
    socket.on('disconnect', async ()=>{
        try{
            let room = await Room.findOne({'players.socketID': socket.id});
            for(let i=0; i<room.players.length; i++) {
                if(room.players[i].socketID === socket.id) {
                    room.players.splice(i, 1);
                    break;
                }
            }
            room = await room.save();
            if(room.players.length === 1) {
                socket.broadcast.to(room.name).emit('show-leaderboard', room.players);
            } else {
                socket.broadcast.to(room.name).emit('user-disconnected', room);
            }
//            DB.collection("Room").remove(room, function(err, obj) {
//                if (err) throw err;
//                console.log(obj.result.n + " document(s) deleted");
//                DB.close();
//            });
        }catch (err){
            console.log(err);
        }
    })
})

server.listen(port, "0.0.0.0", ()=>{
    console.log('Server started and running in port ' + port);
})