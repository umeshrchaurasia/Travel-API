// routes/api.js
const express = require('express');
const router = express.Router();
const db = require('../bin/dbconnection');
const base = require('../controller/baseController');
const wrapper = require('../controller/wrapper');

const travelController = require('../controller/TravelController');

router.get('/test-db', wrapper.asyncHandler(async (req, res) => {
    const [rows] = await db.query('SELECT 1');
    base.send_response("Database connection successful", rows, res);
}));

router.get('/', (req, res) => {
    res.send({ message: 'Welcome to the API Route! New' });
  });

// Employee routes
router.get('/employee_list', wrapper.asyncHandler(travelController.getEmployees));
router.post('/addemployee', wrapper.asyncHandler(travelController.insertEmployee));


// Login Employee 
router.post('/login', wrapper.asyncHandler(travelController.loginForAll));


// Agent routes
router.get('/agents_listByEmp', wrapper.asyncHandler(travelController.getAgents_listbyEmp));
router.post('/addagent', wrapper.asyncHandler(travelController.insertAgent));


// Admin routes
router.get('/users', wrapper.asyncHandler(travelController.getUsers));



module.exports = router;