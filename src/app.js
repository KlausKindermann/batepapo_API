import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import { MongoClient } from 'mongodb'
import joi from 'joi'
import dayjs from 'dayjs'

dotenv.config()
const app = express()
app.use(express.json())
app.use(cors())

const mongoClient = new MongoClient(process.env.DATABASE_URL)
let db;
try {
    await mongoClient.connect()
    db = mongoClient.db()
    console.log("Mongo deu")
} catch (error) {
    console.log('Erro no servidor')
}

const participantsCollection = db.collection("participants");
const messagesCollection = db.collection("messages");
const participantSchema = joi.object({
    name: joi.string().required().min(3),
});
const messageSchema = joi.object({
    from: joi.string().required(),
    to: joi.string().required().min(3),
    text: joi.string().required().min(1),
    type: joi.string().required().valid("message", "private_message"),
    time: joi.string(),
});


app.post("/participants", async (req, res) => {
    const { name } = req.body

    const { error } = participantSchema.validate({ name }, { abortEarly: false });
    if (error) {
        const errors = error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const nomeCadastrado = await participantsCollection.findOne({ name })
        if (nomeCadastrado) {
            return res.status(409).send("Esse nome ja está sendo usado!")
        }
        await participantsCollection.insertOne({ name, lastStatus: Date.now() })
        await messagesCollection.insertOne({
            from: name,
            to: "Todos",
            text: "entrei na sala...",
            type: "status",
            time: dayjs().format("HH:mm:ss"),
        });
        res.status(201).send("Ok")
    } catch (err) {
        console.log(err)
        res.status(500).send("Algo deu errado")
    }
})

app.get("/participants", async (req, res) => {
    try {
        const participants = await participantsCollection.find().toArray()
        if (!participants) {
            return res.sendStatus(404);
        }
        res.send(participants);
    } catch (error) {
        res.status(500).send("Algo deu errado na lista de participantes")
    }
})

app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body
    const { user } = req.headers;
    const message = {
        from: user,
        to,
        text,
        type,
        time: dayjs().format("HH:mm:ss"),
    };
    try {
        const { error } = messageSchema.validate(message, { abortEarly: false });
        if (error) {
            const errors = error.details.map((detail) => detail.message);
            return res.status(422).send(errors);
        }

        await messagesCollection.insertOne(message);
        res.sendStatus(201);
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
});

app.get("/messages", async (req, res) => {
    const limit = Number(req.query.limit);
    const { user } = req.headers;

    try {
        const messages = await messagesCollection
            .find({
                $or: [
                    { from: user },
                    { to: { $in: [user, "Todos"] } },
                    { type: "message" },
                ],
            })
            .limit(limit).toArray();

        if (messages.length === 0) {
            return res.status(404).send("Nenhuma mensagem");
        }

        res.send(messages);
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
});

app.post("/status", async (req, res) => {
    const { user } = req.headers;

    try {
        const participantExists = await participantsCollection.findOne({
            name: user,
        });

        if (!participantExists) {
            return res.sendStatus(404);
        }

        await participantsCollection.updateOne(
            { name: user },
            { $set: { lastStatus: Date.now() } }
        );

        res.sendStatus(200);
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
});

setInterval(async () => {
    const dezSegundosAtras = Date.now() - 10000;
    try {

        const participantsInactives = await participantsCollection
            .find({ lastStatus: { $lte: dezSegundosAtras } })
            .toArray();

        if (participantsInactives.length > 0) {

            const inactivesMessages = participantsInactives.map((participant) => {
                return {
                    from: participant.name,
                    to: "Todos",
                    text: "sai da sala...",
                    type: "status",
                    time: dayjs().format("HH:mm:ss"),
                };
            });

            await messagesCollection.insertMany(inactivesMessages);
            await participantsCollection.deleteMany({ lastStatus: { $lte: dezSegundosAtras } })
        }
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
}, 15000);

app.listen(5000, () => console.log('oi, deu certo'))