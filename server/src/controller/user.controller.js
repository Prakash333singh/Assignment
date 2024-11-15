import asyncHandler from "../utils/asyncHandler.js";
import apiError from "../utils/ApiError.js";
import apiResponse from "../utils/apiResponse.js";

import { User } from "../models/user.model.js";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Token Generation
const generateToken = async (userId, expiresIn) => {
  return await jwt.sign({ _id: userId }, process.env.JWT_SECRET, { expiresIn });
};

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);

    const accessToken = await generateToken(user._id, "1h");
    const refreshToken = await generateToken(user._id, "7d");

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: 60 * 60 * 1000, // 1 hour in ms
      refreshTokenExpiresIn: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    };
  } catch (error) {
    throw new apiError(
      500,
      "Something went wrong while generating refresh and access token"
    );
  }
};

// Register User
const registerUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    throw new apiError(400, "All fields are required");
  }

  if (!email.includes("@")) {
    throw new apiError(400, "Invalid Email address");
  }

  const existedUser = await User.findOne({ email });

  if (existedUser) {
    throw new apiError(409, "User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    username,
    email: email.toLowerCase(),
    password: hashedPassword,
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res
    .status(201)
    .json(new apiResponse(201, createdUser, "User registered successfully"));
});

// Login User
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new apiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new apiError(404, "User does not exist");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new apiError(401, "Invalid credentials");
  }

  const {
    accessToken,
    refreshToken,
    accessTokenExpiresIn,
    refreshTokenExpiresIn,
  } = await generateAccessAndRefreshTokens(user._id);

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
    sameSite: "lax",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, {
      ...options,
      maxAge: accessTokenExpiresIn,
    })
    .cookie("refreshToken", refreshToken, {
      ...options,
      maxAge: refreshTokenExpiresIn,
    })
    .json(
      new apiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

// Logout User
const logoutUser = asyncHandler(async (req, res) => {
  const token =
    req.body?.token ||
    req.cookies?.refreshToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token is missing",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await User.findByIdAndUpdate(decoded._id, { refreshToken: undefined });

    const options = { httpOnly: true, secure: true };

    res.clearCookie("accessToken", options);
    res.clearCookie("refreshToken", options);

    return res
      .status(200)
      .json(new apiResponse(200, {}, "User logged out successfully"));
  } catch (error) {
    throw new apiError(401, "Invalid token");
  }
});

export { registerUser, loginUser, logoutUser };
