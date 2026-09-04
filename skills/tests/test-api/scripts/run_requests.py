import json
import sys

from playwright.sync_api import sync_playwright

BODY_LIMIT = 2000


def resolve_token(payload, field):
    value = payload
    for key in field.split("."):
        if value is None:
            return None
        value = value[int(key)] if isinstance(value, list) else value.get(key)
    return value


def read_body(response):
    try:
        body = response.json()
    except Exception:
        body = response.text()
    text = json.dumps(body, ensure_ascii=False, default=str)
    return json.loads(text) if len(text) <= BODY_LIMIT else text[:BODY_LIMIT] + "...(truncated)"


def build_headers(request, auth, token):
    headers = json.loads(request["headers"]) if request.get("headers") else {}
    if request.get("useAuth") and token and auth:
        name, _, template = auth["header"].partition(":")
        headers[name.strip()] = template.strip().replace("{token}", str(token))
    return headers


def main():
    with open(sys.argv[1], encoding="utf-8") as f:
        spec = json.load(f)

    results = []

    with sync_playwright() as p:
        context = p.request.new_context(base_url=spec["baseUrl"])

        token = None
        auth = spec.get("auth")
        if auth:
            try:
                response = context.post(auth["path"], data=json.loads(auth["body"]))
                token = resolve_token(read_body(response), auth["tokenField"])
            except Exception as error:
                results.append({"title": "<auth>", "status": None, "body": None, "error": str(error)})

        for request in spec["requests"]:
            try:
                response = context.fetch(
                    request["path"],
                    method=request["method"],
                    headers=build_headers(request, auth, token),
                    data=json.loads(request["body"]) if request.get("body") else None,
                )
                results.append(
                    {
                        "title": request["title"],
                        "status": response.status,
                        "body": read_body(response),
                        "error": None,
                    }
                )
            except Exception as error:
                results.append(
                    {"title": request["title"], "status": None, "body": None, "error": str(error)}
                )

        context.dispose()

    print(json.dumps(results, ensure_ascii=False, default=str))


main()
