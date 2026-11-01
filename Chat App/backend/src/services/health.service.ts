import { prisma } from "../utils/prisma";

export const checkDbHealth = async (): Promise<boolean> => {
  try {
    // Perform a lightweight database query to verify MySQL connection
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("[Database Health] Connection check failed:", error);
    return false;
  }
};
