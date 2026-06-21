const express = require("express");
const { body, param, validationResult } = require("express-validator");
const { run, get, all } = require("../database/db");
const { success, error } = require("../utils/apiResponse");

const router = express.Router();

const handleValidation = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) return error(res, 400, result.array()[0].msg);
  return next();
};

// GET /api/ai/settings
router.get("/settings", async (req, res, next) => {
  try {
    const settings = await get("SELECT * FROM AutoReplySettings ORDER BY Id DESC LIMIT 1");
    return success(res, "AI settings retrieved successfully", settings || {});
  } catch (err) {
    return next(err);
  }
});

// PUT /api/ai/settings
router.put(
  "/settings",
  [
    body("IsEnabled").isInt({ min: 0, max: 1 }).withMessage("IsEnabled must be 0 or 1"),
    body("FixedReplyEnabled").isInt({ min: 0, max: 1 }).withMessage("FixedReplyEnabled must be 0 or 1"),
    body("AlwaysSendFixedMessage").isInt({ min: 0, max: 1 }).withMessage("AlwaysSendFixedMessage must be 0 or 1"),
    body("AIReplyEnabled").isInt({ min: 0, max: 1 }).withMessage("AIReplyEnabled must be 0 or 1"),
    body("FixedReplyText").trim().notEmpty().withMessage("FixedReplyText is required"),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const now = new Date().toISOString();
      const { IsEnabled, FixedReplyEnabled, AlwaysSendFixedMessage, AIReplyEnabled, FixedReplyText } = req.body;
      const existing = await get("SELECT Id FROM AutoReplySettings ORDER BY Id DESC LIMIT 1");

      if (existing) {
        await run(
          `UPDATE AutoReplySettings
           SET IsEnabled = ?, FixedReplyEnabled = ?, AlwaysSendFixedMessage = ?,
               AIReplyEnabled = ?, FixedReplyText = ?, UpdatedOn = ?
           WHERE Id = ?`,
          [IsEnabled, FixedReplyEnabled, AlwaysSendFixedMessage, AIReplyEnabled, FixedReplyText, now, existing.Id]
        );
      } else {
        await run(
          `INSERT INTO AutoReplySettings
           (IsEnabled, FixedReplyEnabled, AlwaysSendFixedMessage, AIReplyEnabled, FixedReplyText, CreatedOn, UpdatedOn)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [IsEnabled, FixedReplyEnabled, AlwaysSendFixedMessage, AIReplyEnabled, FixedReplyText, now, now]
        );
      }

      const updated = await get("SELECT * FROM AutoReplySettings ORDER BY Id DESC LIMIT 1");
      return success(res, "AI settings updated successfully", updated);
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/ai/history
router.get("/history", async (req, res, next) => {
  try {
    const history = await all("SELECT * FROM AutoReplyHistory ORDER BY Id DESC LIMIT 100");
    return success(res, "Auto reply history retrieved successfully", history);
  } catch (err) {
    return next(err);
  }
});

// GET /api/ai/history/:phone
router.get(
  "/history/:phone",
  [param("phone").trim().notEmpty().withMessage("Phone number is required"), handleValidation],
  async (req, res, next) => {
    try {
      const history = await all(
        "SELECT * FROM AutoReplyHistory WHERE Phone = ? ORDER BY Id DESC LIMIT 100",
        [req.params.phone]
      );
      return success(res, `History for ${req.params.phone}`, history);
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
