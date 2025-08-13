const logger = require('../bin/Logger');

module.exports = {
    send_response: function(message, data, res) {
        try {
            res.json({
                Message: message,
                Status: data ? "Success" : "Failure",
                StatusNo: data ? 0 : 1,
                MasterData: data
            });
        } catch (error) {
            logger.error('Response Error:', error);
            res.status(500).json({
                Message: "Internal Server Error",
                Status: "Failure",
                StatusNo: 1,
                MasterData: null
            });
        }
    }
};