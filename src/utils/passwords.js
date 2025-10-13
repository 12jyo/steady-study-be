import bcrypt from "bcryptjs";

export const hashPassword = async (plain) => bcrypt.hash(plain, 10);
export const verifyPassword = async (plain, hash) => bcrypt.compare(plain, hash);
