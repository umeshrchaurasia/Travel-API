const base = require('../controller/baseController');

const requestAccess = (req, res, next) => {
    const token = req.header("token");
    
    // TODO: Replace with proper JWT validation or secure token verification
    if (token === process.env.API_TOKEN) {
        next();
    } else {
        base.send_response("Not Authorized", null, res);
    }
};

module.exports = requestAccess;