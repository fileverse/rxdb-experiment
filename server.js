import dotenv from 'dotenv';
dotenv.config();
import { MongoClient } from 'mongodb';
import express from 'express';
import { lastOfArray } from 'rxdb/plugins/core';
import { Subject } from 'rxjs';

const mongoClient = new MongoClient(process.env.MONGOURI);
const mongoConnection = await mongoClient.connect();
const mongoDatabase = mongoConnection.db('rxdb');
const mongoCollection = await mongoDatabase.collection('myDocs');

const app = express();
app.use(express.json());

app.get('/pull', async (req, res) => {
    const id = req.query.id;
    const updatedAt = parseFloat(req.query.updatedAt);
    const documents = await mongoCollection.find({
        $or: [
            /**
             * Notice that we have to compare the updatedAt AND the id field
             * because the updateAt field is not unique and when two documents have
             * the same updateAt, we can still "sort" them by their id.
             */
            {
                updateAt: { $gt: updatedAt }
            },
            {
                updateAt: { $eq: updatedAt },
                id: { $gt: id }
            }
        ]
    }).limit(parseInt(req.query.batchSize, 10)).toArray();
    const newCheckpoint = documents.length === 0 ? { id, updatedAt } : {
        id: lastOfArray(documents).id,
        updatedAt: lastOfArray(documents).updatedAt
    };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ documents, checkpoint: newCheckpoint }));
});


// used in the pull.stream$ below
let lastEventId = 0;
const pullStream$ = new Subject();

app.get('/push', async (req, res) => {
    const changeRows = req.body;
    const conflicts = [];
    const event = {
        id: lastEventId++,
        documents: [],
        checkpoint: null
    };
    for (const changeRow of changeRows) {
        const realMasterState = mongoCollection.findOne({id: changeRow.newDocumentState.id});
        if(
            realMasterState && !changeRow.assumedMasterState ||
            (
                realMasterState && changeRow.assumedMasterState &&
                /*
                 * For simplicity we detect conflicts on the server by only compare the updateAt value.
                 * In reality you might want to do a more complex check or do a deep-equal comparison.
                 */
                realMasterState.updatedAt !== changeRow.assumedMasterState.updatedAt
            )
        ) {
            // we have a conflict
            conflicts.push(realMasterState);
        } else {
            // no conflict -> write the document
            mongoCollection.updateOne(
                {id: changeRow.newDocumentState.id},
                changeRow.newDocumentState
            );
            event.documents.push(changeRow.newDocumentState);
            event.checkpoint = { id: changeRow.newDocumentState.id, updatedAt: changeRow.newDocumentState.updatedAt };
        }
    }
    if(event.documents.length > 0){
        myPullStream$.next(event);
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(conflicts));
});

app.get('/pullStream', async (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    });
    const subscription = pullStream$.subscribe(event => res.write('data: ' + JSON.stringify(event) + '\n\n'));
    req.on('close', () => subscription.unsubscribe());
});

app.listen(process.env.PORT || 8080, () => {
  console.log(`Example app listening on port 8080`)
});