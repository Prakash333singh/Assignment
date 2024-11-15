import { User } from "../models/user.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import apiError from "../utils/apiError.js";
import jwt from "jsonwebtoken";

export const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    // Extract token from headers, cookies, or request body
    const token =
      req.body?.token ||
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    // If no token is provided
    if (!token) {
      throw new apiError(401, "Token is missing. Please authenticate.");
    }

    // Verify the token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach the decoded user information to the request object
      req.user = decoded;
    } catch (error) {
      throw new apiError(401, "Invalid or expired token. Please log in again.");
    }

    // Proceed to the next middleware or controller
    next();
  } catch (error) {
    // Catch any errors and send an appropriate response
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "An error occurred during authentication.",
    });
  }
});
