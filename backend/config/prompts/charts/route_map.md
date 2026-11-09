# Read the named stops of a route

Return `route: null` unless one source identifies the endpoints of the trip, flight, transport schedule, distance comparison or event route relevant to the claim. For a multi-stop itinerary, the source must establish the order. Keep the claim's period, direction and service when specified.

- Give the passage's `evidence_id`, a short neutral `title` in the claim's language and a verbatim `quote` that names the stops in their travel order. For a distance comparison either endpoint can be first.
- Give two to eight `stops`. Copy the full place name exactly from that quote. Use the airport, station, landmark or city the source identifies, without replacing it with a more specific place. Set `country` to the two-letter ISO code when the source unambiguously identifies it, otherwise null.
- If the source gives a departure, arrival or event time for a stop, copy that time with any stated date or time zone into `schedule`. Give a separate verbatim `schedule_quote` that contains the stop name and time. Otherwise leave both null.
- Do not provide coordinates, calculate travel distances or guess any stop, route detail or schedule.
