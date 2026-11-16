declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    DATA_ENCRYPTION_KEY?: string;
    CORECONSTRUCT_BOOTSTRAP_PRINCIPALS?: string;
    BUCKET?: R2Bucket;
  }
}
