import mongoose from 'mongoose';
const { Schema } = mongoose;

const _documentUpdates = {};

_documentUpdates.schema = new Schema({
  id: {
    type: String,
    required: true,
  },
  docId: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  deleted: {
    type: Boolean,
    default: false,
  },
  timestamp: {
    type: Number,
    required: true,
    default: Date.now,
  },
});

_documentUpdates.schema.pre('save', function (next) {
  this.timeStamp = Date.now();
  next();
});

_documentUpdates.schema.methods.safeObject = function () {
  const safeFields = [
    '_id',
    'id',
    'docId',
    'content',
    'timestamp',
  ];
  const newSafeObject = {};
  safeFields.forEach((elem) => {
    // eslint-disable-next-line security/detect-object-injection
    newSafeObject[elem] = this[elem];
  });
  return newSafeObject;
};

_documentUpdates.model = mongoose.model('document_updates', _documentUpdates.schema);

export default _documentUpdates;
