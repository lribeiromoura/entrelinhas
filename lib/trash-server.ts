import { db } from "./db";
import { removePrivate } from "./storage";
import { createTrashService } from "./trash-service";
export const trashService = createTrashService(db, removePrivate);
