import type { SupabaseClient } from "@supabase/supabase-js";
export const maxPhotoBytes = 3 * 1024 * 1024;
export function createPrivateStorage(client: SupabaseClient, bucket: string) {
  return {
    async prepare() {
      const { data, error } = await client.storage.getBucket(bucket);
      if (error) {
        if (String(error.statusCode) !== "404")
          throw Error("Não foi possível verificar o armazenamento privado.");
        const created = await client.storage.createBucket(bucket, {
          public: false,
          fileSizeLimit: maxPhotoBytes,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        });
        if (created.error)
          throw Error("Não foi possível criar o armazenamento privado.");
      } else if (data.public)
        throw Error(
          "O bucket deve ser privado. Não publique com um bucket público.",
        );
    },
    async upload(owner: string, id: string, mime: string, bytes: Buffer) {
      const path = `${owner}/${id}`;
      const { error } = await client.storage
        .from(bucket)
        .upload(path, bytes, { contentType: mime, upsert: false });
      if (error)
        throw Error(
          "Não foi possível enviar a imagem. Seu formulário foi preservado.",
        );
      return path;
    },
    async remove(path: string) {
      const { error } = await client.storage.from(bucket).remove([path]);
      if (error) console.error("Falha ao limpar imagem não vinculada.");
    },
    async download(path: string, owner: string) {
      if (!path.startsWith(owner + "/") || path.includes(".."))
        throw Error("Imagem indisponível.");
      const { data, error } = await client.storage
        .from(bucket)
        .download(path, {}, { cache: "no-store" });
      if (error || !data) throw Error("Imagem temporariamente indisponível.");
      return data;
    },
  };
}
