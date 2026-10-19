import { createClient } from "@supabase/supabase-js";
import { cloud, bucket, supabaseSecret } from "./settings";
import { createPrivateStorage } from "./storage-provider";
export { maxPhotoBytes } from "./storage-provider";
const client = cloud
  ? createClient(process.env.SUPABASE_URL!, supabaseSecret!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;
const storage = client ? createPrivateStorage(client, bucket) : null;
export async function prepareStorage() {
  await storage?.prepare();
}
export async function uploadPrivate(
  owner: string,
  id: string,
  mime: string,
  bytes: Buffer,
) {
  return storage ? storage.upload(owner, id, mime, bytes) : null;
}
export async function removePrivate(path: string) {
  await storage?.remove(path);
}
export async function downloadPrivate(path: string, owner: string) {
  if (!storage) throw Error("Imagem indisponível.");
  return storage.download(path, owner);
}
