TEXT = {"inputType": "text", "text": "The line opened on 6 November 2021, and it carries many passengers."}


def run(client, body=TEXT):
    created = client.post("/api/check", json=body)
    assert created.status_code == 202, created.text
    return client.get(f"/api/check/{created.json()['id']}").json()
