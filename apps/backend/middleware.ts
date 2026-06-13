import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.headers.token as string;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    if (decoded.userId) {
      req.userId = decoded.userId;
      next();
    } else {
      res.status(403).json({
        message: "Incorrect token",
      });
    }
  } catch (e) {
    res.status(403).json({
      message: "Not Authorized",
    });
  }
}
