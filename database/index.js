import dotenv from 'dotenv';
dotenv.config();

// Bring Mongoose into the app
import mongoose from 'mongoose';

// Build the connection string
const dbURI = process.env.MONGOURI || 'mongodb://localhost/boilerplate_graphql';

// Create the database connection
mongoose.connect(dbURI).then(() => {
  console.log(dbURI);
  console.log('MongoDB Connected');
}).catch((err) => {
    console.log('DB Error: ', err);
    throw err;
});

// CONNECTION EVENTS
// When successfully connected
mongoose.connection.on('connected', function () {
  console.log('Mongoose default connection open to ' + dbURI);
});

// If the connection throws an error
mongoose.connection.on('error', function (err) {
  console.log('Mongoose default connection error: ' + err);
});

// When the connection is disconnected
mongoose.connection.on('disconnected', function () {
  console.log('Mongoose default connection disconnected');
});

// If the Node process ends, close the Mongoose connection
process.on('SIGINT', function () {
  mongoose.connection.close(function () {
    console.log(
      'Mongoose default connection disconnected through app termination',
    );
    throw new Error(
      'Mongoose default connection disconnected through app termination',
    );
  });
});
