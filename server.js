import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { lastOfArray } from 'rxdb/plugins/core';
import { Subject } from 'rxjs';
import cors from 'cors';
import './database/index.js';
import Models from './database/models/index.js';

const app = express();
app.use(express.json());

app.use(cors());

app.get('/pull', async (req, res) => {
    const id = req.query.id;
    const updatedAt = parseFloat(req.query.updatedAt);
    const documents = await Models.DocumentUpdates.find({
        $or: [
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

app.post('/push', async (req, res) => {
    const changeRows = req.body;
    const conflicts = [];
    const event = {
        id: lastEventId++,
        documents: [],
        checkpoint: null
    };
    for (const changeRow of changeRows) {
        const realMasterState = await Models.DocumentUpdates.findOne({id: changeRow.newDocumentState.id});
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
            await Models.DocumentUpdates.updateOne(
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