import { currentUser } from "@clerk/nextjs/server";
import { db } from "./prisma";

export const checkUser = async () => {
  const user = await currentUser();

  if (!user) {
    return null;
  }

  try {
    const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

    // Use upsert to avoid race conditions that cause duplicate key errors on clerkUserId
    const ensuredUser = await db.user.upsert({
      where: {
        clerkUserId: user.id,
      },
      create: {
        clerkUserId: user.id,
        name,
        imageUrl: user.imageUrl,
        email: user.emailAddresses[0]?.emailAddress,
      },
      update: {},
    });

    return ensuredUser;
  } catch (error) {
    console.log(error.message);
  }
};
