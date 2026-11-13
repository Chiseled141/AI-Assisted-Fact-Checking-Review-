<!-- Research model: reads street locations for the incident map. -->
# Task: locate a reported event or affected area

Read the claim and source passages. Return an empty list unless they describe the same specific event, such as a crash, traffic jam, road restriction, flood or public event, and at least one passage states where it took place in Hà Nội or TP.HCM. Compare dates and event details. Ignore aggregate statistics, predictions, general conditions and unrelated incidents.

Return at most one location per source, including differing locations if sources disagree about where the same incident occurred. Each location has:

- `evidence_id`: the passage that reports the location.
- `quote`: a short, verbatim passage stating where the incident took place. Include the city if the source names it and the claim does not.
- `city`: the city name exactly as it appears in the quote or the claim. Hồ Gươm (Hồ Hoàn Kiếm) alone also identifies Hà Nội. Do not infer a city from a street name.
- `district`: the ward or district name if the quote or claim states one for the incident, copied exactly, without prefixes such as phường or quận. Otherwise null.
- `roads`: one named road copied exactly from the quote, or two named roads when the quote explicitly places the incident at their intersection. Preserve an explicit Đường or Phố prefix and omit house numbers and directions. Return one road for a segment along that road. Do not treat the road that traffic backed up onto, a detour, or the location of a hospital as the incident site.
- `toward`: for a single road, copy the destination or compass direction of the affected carriageway only if the source explicitly states it (e.g. `Ngã Tư Sở` in “hướng đi Ngã Tư Sở”). Use consecutive sentences in the quote if needed to show both the location and direction of the involved vehicle. If the vehicles were moving in opposite directions, the source is ambiguous, or a direction is merely a detour, return null.
- `whole_road`: true only if the source explicitly says the incident or restriction applies to the entire named road, for example “cấm xe trên toàn tuyến đường X”. A road name alone or a segment between two points is insufficient.
- `areas`: use this instead of `roads` when the claim or source describes an affected ward, district, landmark area or named stretch of road. Include up to four areas that the same quote explicitly identifies as affected together. Each has a `name` copied from the quote and a `kind` of `area` or `road_segment`. Keep prefixes like “phường”, “quận” and “Hồ”. For a named road stretch, copy its two endpoints into `start` and `end` if the quote gives them. Leave endpoints null when the source only says it happened around a named road. Keep `roads` empty when using `areas`. When a claim asks about a junction or point incident on one road, use `roads` as usual.
