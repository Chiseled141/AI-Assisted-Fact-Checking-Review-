from tests.helpers import run


class TestCorrections:
    def correction(self, **overrides):
        return {
            "verdict": "outdated",
            "reason": "A later timetable replaced these dates.",
            "evidenceIds": [],
            "expectedVersion": 1,
            **overrides,
        }

    def test_adds_a_revision_and_keeps_the_original(self, client):
        claim = run(client)["claims"][0]
        evidence = client.get(f"/api/claims/{claim['id']}/evidence").json()[0]["id"]
        response = client.post(
            f"/api/claims/{claim['id']}/corrections",
            json=self.correction(
                evidenceIds=[evidence],
                citationFreshness={evidence: {"status": "outdated", "reason": "Replaced."}},
                attachments=[{"id": "a", "name": "p.png", "type": "image/png", "size": 3, "dataUrl": "data:image/png;base64,AAA"}],
            ),
        )
        assert response.status_code == 201, response.text
        assert response.json()["claim"]["currentVersion"] == 2
        assert response.json()["revision"]["attachments"][0]["dataUrl"].startswith("data:")
        revisions = client.get(f"/api/claims/{claim['id']}/revisions").json()
        assert [(item["version"], item["kind"], item["verdict"]) for item in revisions] == [
            (1, "ai_assessment", "supported"),
            (2, "human_correction", "outdated"),
        ]

    def test_stale_version_is_a_conflict_and_changes_nothing(self, client):
        claim = run(client)["claims"][0]
        response = client.post(f"/api/claims/{claim['id']}/corrections", json=self.correction(expectedVersion=7))
        assert response.status_code == 409
        assert response.json()["detail"] == {"expectedVersion": 7, "currentVersion": 1}
        assert len(client.get(f"/api/claims/{claim['id']}/revisions").json()) == 1

    def test_reason_and_evidence_are_validated(self, client):
        claim = run(client)["claims"][0]
        path = f"/api/claims/{claim['id']}/corrections"
        assert client.post(path, json=self.correction(reason="short")).status_code == 422
        assert client.post(path, json=self.correction(evidenceIds=["other"])).status_code == 422
        image = {"id": "a", "name": "p", "type": "image/png", "size": 1, "dataUrl": "data:image/png;base64,AAA"}
        assert client.post(path, json=self.correction(attachments=[image] * 4)).status_code == 422
        script = {**image, "dataUrl": "data:text/html;base64,AAA"}
        assert client.post(path, json=self.correction(attachments=[script])).status_code == 422
        huge = {**image, "dataUrl": "data:image/png;base64," + "A" * 900_000}
        assert client.post(path, json=self.correction(attachments=[huge])).status_code == 422
