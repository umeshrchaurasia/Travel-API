/*var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var mongo_conn=require('../bin/mongo_conn.js');
mongoose.connect(mongo_conn, { autoIndex: false });
var docSchema = new mongoose.Schema({
  fieldname: String,
  originalname: String,
  encoding: String,
  mimeptype: String,
  destination: String,
  filename: String,
  path: String,
  size: Number,
  created_at: Date,
  updated_at: Date
});*/
var Doc = "";//mongoose.model('Docs', docSchema);

module.exports = Doc;