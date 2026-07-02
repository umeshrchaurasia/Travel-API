// controller/Policyboss_share.js

const db = require('../bin/dbconnection');
const base = require('./baseController');
const logger = require('../bin/Logger');

class Policyboss_shareController {

    async getPremium_Reliance(req, res) {
        try {
            const { duration, age_years, age_months, plan_amount, type, payout, paymentmode } = req.body;

            // 1. Validate Integers/Numbers
            // Helper function to check if a value is a valid integer
            const isInvalidInt = (val) => val === undefined || val === null || !Number.isInteger(Number(val));
            // Helper function to check if a value is a valid number (allowing decimals for plan_amount)
            const isInvalidNumber = (val) => val === undefined || val === null || isNaN(Number(val));

            if (isInvalidInt(duration)) {
                return base.send_response("Invalid parameter: 'duration' is required and must be an integer.", null, res, 400);
            }
            if (isInvalidInt(age_years)) {
                return base.send_response("Invalid parameter: 'age_years' is required and must be an integer.", null, res, 400);
            }
            if (isInvalidInt(age_months)) {
                return base.send_response("Invalid parameter: 'age_months' is required and must be an integer.", null, res, 400);
            }
            if (isInvalidNumber(plan_amount)) {
                return base.send_response("Invalid parameter: 'plan_amount' is required and must be a valid number.", null, res, 400);
            }
            if (isInvalidInt(payout)) {
                return base.send_response("Invalid parameter: 'payout' is required and must be an integer.", null, res, 400);
            }

            // 2. Validate Strings
            if (!type || (type !== 'including' && type !== 'excluding')) {
                return base.send_response(
                    "Invalid parameter: 'type' is required and must be either 'including' or 'excluding'.",
                    null,
                    res,
                    400
                );
            }

            if (!paymentmode || typeof paymentmode !== 'string' || paymentmode.trim() === '') {
                return base.send_response(
                    "Invalid parameter: 'paymentmode' is required and must be a valid string.",
                    null,
                    res,
                    400
                );
            }

            // Call the updated stored procedure
            const [rows] = await db.query(
                `CALL GetPremium_Reliance(?, ?, ?, ?, ?, ?, ?)`,
                [
                    Number(duration),
                    Number(age_years),
                    Number(age_months),
                    Number(plan_amount),
                    type,
                    Number(payout),
                    paymentmode
                ]
            );

            // Get first row of result
            const result = rows[0][0];

            if (result && result.SuccessStatus === '1') {
                // Successful calculation
                base.send_response(
                    `Premium ${type} successful`,
                    {
                        premium_amount: result.premium_amount,
                        agentcollected: result.agentcollected,
                        paymentmode: result.paymentmode,
                        payout: result.v_Payout || result.Payout,
                        reliance_premium_amount: result.reliance_premium_amount,
                        upfront_agent_commission: result.upfront_agent_commission,
                        commission_agent: result.commission_agent,
                        premium_without_gst: result.premium_without_gst,
                        premium_gst: result.premium_gst
                    },
                    res
                );
            } else {
                // Failed calculation or invalid parameters from Database side
                base.send_response(
                    result?.Message || "Failed to calculate premium",
                    null,
                    res,
                    400
                );
            }

        } catch (error) {
            logger.error('Error in getPremium_Reliance:', error);
            base.send_response(
                "Error during premium calculation process",
                null,
                res,
                500
            );
        }
    }


    async getPremium_Bajaj(req, res) {
        try {
            const { duration, age_years, age_months, plan_amount, type, payout, paymentmode } = req.body;

            // 1. Validate Integers/Numbers
            const isInvalidInt = (val) => val === undefined || val === null || !Number.isInteger(Number(val));
            const isInvalidNumber = (val) => val === undefined || val === null || isNaN(Number(val));

            if (isInvalidInt(duration)) {
                return base.send_response("Invalid parameter: 'duration' is required and must be an integer.", null, res, 400);
            }
            if (isInvalidInt(age_years)) {
                return base.send_response("Invalid parameter: 'age_years' is required and must be an integer.", null, res, 400);
            }
            if (isInvalidInt(age_months)) {
                return base.send_response("Invalid parameter: 'age_months' is required and must be an integer.", null, res, 400);
            }
            if (isInvalidNumber(plan_amount)) {
                return base.send_response("Invalid parameter: 'plan_amount' is required and must be a valid number.", null, res, 400);
            }
            if (isInvalidInt(payout)) {
                return base.send_response("Invalid parameter: 'payout' is required and must be an integer.", null, res, 400);
            }

            // 2. Validate Strings
            if (!type || (type !== 'including' && type !== 'excluding')) {
                return base.send_response(
                    "Invalid parameter: 'type' is required and must be either 'including' or 'excluding'.",
                    null,
                    res,
                    400
                );
            }

            if (!paymentmode || typeof paymentmode !== 'string' || paymentmode.trim() === '') {
                return base.send_response(
                    "Invalid parameter: 'paymentmode' is required and must be a valid string.",
                    null,
                    res,
                    400
                );
            }

            // Call the updated stored procedure
            const [rows] = await db.query(
                `CALL GetPremium_Bajaj(?, ?, ?, ?, ?, ?, ?)`,
                [
                    Number(duration),
                    Number(age_years),
                    Number(age_months),
                    Number(plan_amount),
                    type,
                    Number(payout),
                    paymentmode
                ]
            );

            // Get first row of result
            const result = rows[0][0];

            if (result && result.SuccessStatus === '1') {
                // Successful calculation
                base.send_response(
                    `Premium ${type} successful`,
                    {
                        premium_amount: result.premium_amount,
                        agentcollected: result.agentcollected,
                        paymentmode: result.paymentmode,
                        payout: result.v_Payout || result.Payout,
                        reliance_premium_amount: result.reliance_premium_amount,
                        upfront_agent_commission: result.upfront_agent_commission,
                        // Added the new fields from the Bajaj stored procedure
                        commission_agent: result.commission_agent,
                        premium_without_gst: result.premium_without_gst,
                        premium_gst: result.premium_gst
                    },
                    res
                );
            } else {
                // Failed calculation or invalid parameters from Database side
                base.send_response(
                    result?.Message || "Failed to calculate premium",
                    null,
                    res,
                    400
                );
            }

        } catch (error) {
            // Fixed the logger to correctly mention Bajaj
            logger.error('Error in getPremium_Bajaj:', error);
            base.send_response(
                "Error during premium calculation process",
                null,
                res,
                500
            );
        }
    }
}

module.exports = new Policyboss_shareController();