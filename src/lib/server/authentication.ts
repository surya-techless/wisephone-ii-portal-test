export default function validateBearerToken(request: Request): boolean {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.split(" ")[1];
  return token === import.meta.env.API_TOKEN;
}
