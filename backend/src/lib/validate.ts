import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

// Returns 400 with the first issue path/message when the body fails to parse.
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      return res.status(400).json({
        error: "Invalid request body",
        field: issue.path.join("."),
        message: issue.message,
      });
    }
    req.body = result.data;
    next();
  };
}
