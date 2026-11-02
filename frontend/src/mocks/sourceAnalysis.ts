// WHAT EACH SOURCE SAYS, AND HOW THE AI MODELS READ IT. Keyed by evidence key.
// For the real sources in realExample.ts, `summary` and `keyPoints` restate facts from each article in our own words;
// they were read from the pages on 2 November 2026. Do not add quotations here. For the fictional sources in
// fixtures.ts these fields are as fictional as the source itself.
// `assessment` and `judgeNotes` are always simulated: no AI call produced them, and the page says so.

export interface FixtureAnalysis {
  /** What the article reports, in a sentence or two. */
  summary: string;
  /** Details from the article, in our own words. */
  keyPoints: string[];
  /** How much this source can prove about the claim, and what it can't. */
  assessment: string;
  /** Each judge's comment, in the order the check's judges are listed. Names come from the check. */
  judgeNotes: string[];
}

export const sourceAnalysis: Record<string, FixtureAnalysis> = {
  // Real sources, English example: the metro line
  'vnexpress-metro': {
    summary:
      'VnExpress reports the first train leaving Cat Linh station at 7:40 a.m. on 6 November 2021, bound for Yen Nghia in Ha Dong. It presents the line as Vietnam’s first metro service.',
    keyPoints: [
      'A full trip on the 13 km elevated track takes 23 minutes and stops at 12 stations.',
      'Rides were free for the first 15 days, then cost VND8,000–15,000 a ticket.',
      'The project took 10 years, and its cost rose 57% to VND18 trillion ($868 million).',
    ],
    assessment:
      'A same-day report with an exact departure time, which makes it strong evidence for the date. One nuance: fares only began after the free period, so “commercial operation” here means the line opened to the public.',
    judgeNotes: [
      'The line, the day and the first departure all match the claim. I read this as direct support.',
      'I agree on the date. I would note that paying passengers came 15 days later, which matters only under a strict reading of “commercial”.',
    ],
  },
  'baochinhphu-metro': {
    summary:
      'The government news portal reports the line entering service on the morning of Saturday 6 November 2021, with a dated photo of national and city leaders on the first trip.',
    keyPoints: [
      'Construction began in October 2011. Trial runs ended in December 2020 after more than 70,000 km of tests.',
      'The line runs for more than 13 km, with 12 stations and 13 trains of up to 960 passengers each.',
      'Travel was free for the first 15 days, and the lowest fare after that was VND8,000.',
    ],
    assessment:
      'An official report from the opening itself, so it confirms what happened and when. It covers the event and the technical plan, not how the line performed afterwards.',
    judgeNotes: [
      'A direct, dated account of the first trip. It supports the claim on both the event and the date.',
      'Consistent with the other same-day reports. Its operating hours and fares also line up with what they describe.',
    ],
  },
  'vir-metro': {
    summary:
      'Vietnam Investment Review reports that the line started commercial operation that day, after 10 years of construction, and focuses on the fares and the rise in cost.',
    keyPoints: [
      'Free rides ran until 21 November. Then singles cost VND8,000–15,000, a day ticket VND30,000 and a monthly ticket VND200,000.',
      'The line has 733 operating staff, according to the head of Hanoi Railway Ltd.',
      'Total investment was about $886 million, against an original estimate of $381.3 million.',
    ],
    assessment:
      'Same-day business reporting that states the date directly and doesn’t skip the delays. Its figures differ slightly from VnExpress ($886 million against $868 million, 25 minutes against 23), but neither difference touches the date.',
    judgeNotes: [
      'It says “today” in an article dated 6 November, so the date is clear. Supports the claim.',
      'The small differences in cost and trip time between outlets are worth noting. They don’t change my reading of when the line opened.',
    ],
  },
  'cand-metro': {
    summary:
      'Công an nhân dân reports the Ministry of Transport handing the line to the Hanoi administration on 6 November for commercial operation, with the Deputy Prime Minister present.',
    keyPoints: [
      'The State Inspection Council agreed on 29 October to put the line into operation.',
      'Construction began in October 2011 and was basically finished in November 2018.',
      'Trains can reach 80 km/h, but practical operating speed is limited to around 35 km/h.',
    ],
    assessment:
      'Adds the steps that led to the date: inspection approval first, then the handover. That explains why service began on 6 November, as well as confirming that it did.',
    judgeNotes: [
      'The handover and the start of operation are given the same date. Supports the claim.',
      'The approval on 29 October makes the timeline more convincing, because the start date follows from a recorded decision.',
    ],
  },
  'nhandan-metro': {
    summary:
      'Reporting a press briefing held on 4 November, two days before the event, Nhân Dân gives the plan: handover at 7 a.m. on 6 November, then commercial operation.',
    keyPoints: [
      'Hanoi’s vice chairman said the project ran six years behind schedule.',
      'Operation comes in three phases. The phase starting on 6 November lasts at least a year, followed by a safety assessment.',
      'The first 15 days were planned to be free, with fares of VND8,000–15,000 afterwards.',
    ],
    assessment:
      'Written before the event, so it shows the plan rather than proving it happened. That is why it counts as background and isn’t cited in the verdict.',
    judgeNotes: [
      'Useful for the plan only. An article from 4 November can’t confirm what happened on 6 November.',
      'It matches the later reports, and the phased rollout is helpful context. I would not count it toward the verdict.',
    ],
  },

  // Real sources, English example: the WHO emergency
  'who-remarks': {
    summary:
      'In his opening remarks on 5 May 2023, the WHO Director-General says the Emergency Committee met for the 15th time the day before and advised ending the emergency. He accepts the advice and makes the declaration.',
    keyPoints: [
      'He stresses that COVID-19 is still a global health threat, and that it claimed a life every three minutes the week before.',
      'Almost 7 million deaths had been reported to WHO, and he puts the true toll at 20 million or more.',
      'A Review Committee will develop long-term recommendations for countries.',
    ],
    assessment:
      'The primary source: the official who has the authority to make this declaration, in WHO’s own transcript. It ends the emergency status, not the virus or the threat, and the claim’s wording respects that.',
    judgeNotes: [
      'The claim almost repeats the declaration, and the date is on the document. Nothing could be more direct.',
      'Agreed. A careful reader should keep the distinction he draws between a global emergency and a global threat.',
    ],
  },
  'yle-emergency': {
    summary:
      'This newsletter post from the same day reports that WHO declared the end of the international emergency, and sets out to explain what that does and doesn’t mean.',
    keyPoints: [
      'It calls the decision a huge moment in the fight against COVID-19.',
      'Its explanation starts from what the Emergency Committee concluded.',
      'Only the opening is public. The rest of the post asks the reader to sign in.',
    ],
    assessment:
      'A secondary source that relays WHO’s announcement, so it adds little independent confirmation. It helps show how the decision was understood that day. Only its opening could be checked.',
    judgeNotes: [
      'It matches the WHO transcript on the decision and the date. I treat it as corroboration.',
      'Because most of the post couldn’t be read, I give it less weight than the WHO document.',
    ],
  },

  // Real sources, Vietnamese example: the metro line
  'nhadautu-metro-vi': {
    summary:
      'Bài ảnh ghi lại sáng 6/11/2021: sau lễ bàn giao từ Bộ Giao thông vận tải cho UBND TP. Hà Nội, các đoàn tàu lăn bánh lúc 7h30, chở những hành khách đầu tiên đi miễn phí.',
    keyPoints: [
      'Rất đông người dân có mặt tại ga Cát Linh trong ngày đầu mở cửa.',
      'Khách mua vé ở máy tự động hoặc tại quầy, rồi quẹt vé để qua cổng soát vé.',
      'Nhân viên tàu và nhà ga liên tục hướng dẫn hành khách các quy tắc an toàn.',
    ],
    assessment:
      'Đây là ghi nhận tại chỗ, cho thấy tàu thật sự chở khách trong ngày 6/11. Bài mạnh về sự kiện nhưng không nói nhiều về vận hành, nên cần đọc cùng các bài có số liệu.',
    judgeNotes: [
      'Giờ tàu chạy và ngày tháng đều khớp với nhận định. Tôi xem đây là bằng chứng trực tiếp.',
      'Tôi đồng ý về ngày. Tuy nhiên hành khách hôm đó đi miễn phí, nên “thương mại” nên hiểu là đã mở cho công chúng.',
    ],
  },
  'vietnamfinance-metro-vi': {
    summary:
      'VietnamFinance đưa tin lễ bàn giao sáng 6/11/2021. Sau khi tiếp nhận có điều kiện, Hà Nội cho tàu chạy ngay và miễn phí 15 ngày đầu cho mọi hành khách.',
    keyPoints: [
      'Tàu chạy từ 5h đến 23h, giờ cao điểm 6 phút một chuyến, giờ thường 10 phút một chuyến.',
      'Vé lượt từ 8.000 đến 15.000 đồng, vé ngày 30.000 đồng, vé tháng 200.000 đồng (100.000 đồng cho đối tượng ưu tiên).',
      'Có 55 tuyến buýt đã có phương án kết nối với tuyến đường sắt này.',
    ],
    assessment:
      'Bài xác nhận ngày bàn giao và ngày tàu chạy, đồng thời cho thấy một sắc thái: 15 ngày miễn phí được nói là diễn ra trước khi vận hành thương mại. Tiêu đề và các báo khác vẫn lấy mốc 6/11.',
    judgeNotes: [
      'Tiêu đề và ngày đăng ủng hộ trực tiếp mốc 6/11/2021.',
      'Bài có chi tiết đáng lưu ý: nếu hiểu “thương mại” là bắt đầu thu vé thì mốc này muộn hơn 15 ngày. Vì vậy độ tin cậy của tôi thấp hơn một chút.',
    ],
  },
  'baophapluat-metro-vi': {
    summary:
      'Đăng một ngày sau sự kiện, bài dẫn báo cáo của Metro Hà Nội về ngày đầu vận hành thương mại: 25.680 lượt khách vào ga để đi tàu.',
    keyPoints: [
      'Ga Cát Linh chiếm 30,1% lượng khách, ga Yên Nghĩa 20,2%, 10 ga giữa tuyến 49,7%.',
      'Lễ bàn giao diễn ra sáng 6/11, sau đó dự án chính thức vận chuyển hành khách.',
      'Theo Ban Quản lý dự án Đường sắt, dự án cơ bản xây xong từ cuối năm 2018 rồi mới chạy thử.',
    ],
    assessment:
      'Đây là bằng chứng sau sự kiện kèm số liệu cụ thể, nên có giá trị hơn các bài nêu kế hoạch. Số khách do chính đơn vị vận hành báo cáo, nhưng nhận định chỉ cần đến ngày, không cần đến con số này.',
    judgeNotes: [
      'Có số khách của ngày đầu tiên thì tuyến chắc chắn đã chạy. Ủng hộ nhận định.',
      'Đồng ý. Bài cũng gọi rõ ngày 6/11 là ngày đầu vận hành thương mại, điều này giúp làm rõ cách hiểu từ “thương mại”.',
    ],
  },
  'vietnamplus-metro-vi': {
    summary:
      'Đăng ngày 5/11/2021, trước sự kiện một ngày, bài nêu kế hoạch: 7h sáng 6/11 Bộ Giao thông vận tải bàn giao dự án cho Hà Nội, sau đó khánh thành và đưa vào khai thác thương mại.',
    keyPoints: [
      'Sau khi tiếp nhận, tàu sẽ chạy ngay và miễn phí 15 ngày đầu cho mọi hành khách.',
      'Phần chữ của bài rất ngắn và do TTXVN/Vietnam+ thực hiện.',
      'Bài không có thông tin về những gì đã thực sự diễn ra trong ngày 6/11.',
    ],
    assessment:
      'Bài cho biết kế hoạch chứ chưa chứng minh sự kiện đã xảy ra, nên chỉ được xem là thông tin nền và không được dùng trong kết luận.',
    judgeNotes: [
      'Chỉ dùng được để đối chiếu kế hoạch. Bài đăng trước ngày 6/11 nên không thể xác nhận sự kiện.',
      'Kế hoạch khớp với các bài đăng sau đó, cho thấy mốc 6/11 không bị thay đổi vào phút cuối.',
    ],
  },
  'nhandan-metro-vi': {
    summary:
      'Dẫn buổi họp báo chiều 4/11/2021, Nhân Dân nêu kế hoạch: đúng 7h ngày 6/11 dự án được bàn giao, tiếp nhận, sau đó chính thức khai thác thương mại.',
    keyPoints: [
      'Phó Chủ tịch UBND TP. Hà Nội cho biết dự án chậm tiến độ 6 năm.',
      'Vận hành gồm 3 giai đoạn. Giai đoạn bắt đầu từ 6/11 kéo dài tối thiểu 1 năm, sau đó đánh giá an toàn hệ thống.',
      'Giá vé lượt từ 8.000 đến 15.000 đồng, và 15 ngày đầu miễn phí.',
    ],
    assessment:
      'Bài viết trước sự kiện hai ngày nên chỉ cho thấy kế hoạch. Vì vậy nguồn này là thông tin nền và không được dùng trong kết luận.',
    judgeNotes: [
      'Hữu ích để biết kế hoạch, nhưng không thể xác nhận điều chưa xảy ra.',
      'Khớp với các bài đăng sau đó. Thông tin về 3 giai đoạn vận hành cũng là bối cảnh đáng đọc.',
    ],
  },

  // Real sources, Vietnamese example: the WHO emergency
  'vnexpress-who-vi': {
    summary:
      'VnExpress đưa tin tối 5/5/2023 (giờ Việt Nam), Tổng Giám đốc WHO tuyên bố Covid-19 không còn là tình trạng khẩn cấp y tế toàn cầu, đồng thời nói rõ đại dịch chưa kết thúc.',
    keyPoints: [
      'WHO cho biết số ca mắc mới tăng ở Trung Đông, Đông Nam Á và Ấn Độ do biến chủng phụ XBB.1.16.',
      'Tình trạng khẩn cấp có thể được khôi phục nếu tình hình thay đổi.',
      'Chuyên gia có ý kiến khác nhau: có người ủng hộ quyết định, có người cho rằng còn quá sớm.',
    ],
    assessment:
      'Bài khớp với nhận định và có cả ý kiến trái chiều, nên không chỉ đơn thuần chép lại thông báo. Một đoạn trong bài gắn tuyên bố với cuộc họp chiều 4/5; các nguồn khác cho thấy 4/5 là ngày Ủy ban họp, còn 5/5 là ngày công bố.',
    judgeNotes: [
      'Nội dung và ngày đều khớp với nhận định. Ủng hộ trực tiếp.',
      'Tôi lưu ý mốc 4/5 trong bài có thể gây nhầm lẫn. Đối chiếu với các nguồn khác thì ngày tuyên bố vẫn là 5/5.',
    ],
  },
  'vietnamplus-who-vi': {
    summary:
      'VietnamPlus đưa tin ngày 5/5/2023, ông Tedros thông báo tại họp báo rằng Ủy ban Khẩn cấp đã họp lần thứ 15 hôm trước và khuyến nghị chấm dứt tình trạng khẩn cấp.',
    keyPoints: [
      'Lý do được nêu: đại dịch lắng xuống, miễn dịch tăng, tỷ lệ nhập viện và tử vong giảm.',
      'WHO đưa ra mức cảnh báo này lần đầu vào ngày 30/1/2020.',
      'Ngày 3/5, WHO đã công bố kế hoạch ứng phó COVID-19 giai đoạn 2023-2025.',
    ],
    assessment:
      'Bài nêu rõ ngày họp báo và dẫn lời ông Tedros, nên đủ để xác nhận thời điểm. Đây là nguồn thứ cấp, nhưng có thêm bối cảnh về quá trình dẫn đến quyết định.',
    judgeNotes: [
      'Tách rõ ngày Ủy ban họp và ngày công bố, nên ngày 5/5 trong nhận định là đúng.',
      'Đồng ý. Thông tin về kế hoạch 2023-2025 cho thấy WHO đã chuẩn bị chuyển sang giai đoạn dài hạn từ trước.',
    ],
  },
  'nhandan-who-vi': {
    summary:
      'Nhân Dân dẫn hãng tin Reuters và phát biểu tại họp báo ngày 5/5/2023 của ông Tedros, người cho biết đã chấp nhận khuyến nghị của Ủy ban Khẩn cấp.',
    keyPoints: [
      'Theo Reuters, đại dịch đã cướp đi tính mạng của hơn 6,9 triệu người.',
      'Số ca tử vong mỗi tuần giảm từ hơn 100.000 vào tháng 1/2021 xuống còn hơn 3.500 vào tuần thứ ba của tháng 4/2023.',
      'WHO lưu ý Covid-19 vẫn đang tồn tại.',
    ],
    assessment:
      'Bài có số liệu tử vong của WHO để giải thích lý do của quyết định, và nêu rõ nguồn dẫn. Đây là nguồn thứ cấp, xác nhận ngày và nội dung tuyên bố.',
    judgeNotes: [
      'Lời dẫn trực tiếp của ông Tedros và ngày họp báo đều khớp với nhận định.',
      'Số liệu tử vong giúp hiểu vì sao có quyết định này, dù nhận định không cần đến chúng.',
    ],
  },
  'baochinhphu-who-vi': {
    summary:
      'Đăng ngày 6/5/2023, Báo Chính phủ thuật lại tuyên bố của ông Tedros tại họp báo ngày 5/5 và nói thêm về ý nghĩa của quyết định đối với Việt Nam.',
    keyPoints: [
      'Ông Tedros nhấn mạnh COVID-19 vẫn là mối đe dọa sức khỏe toàn cầu.',
      'Các quốc gia được khuyến nghị chuyển từ chế độ khẩn cấp sang quản lý cùng các bệnh truyền nhiễm khác.',
      'Trưởng đại diện WHO tại Việt Nam, TS. Angela Pratt, cho rằng đây chưa phải lúc mất cảnh giác.',
    ],
    assessment:
      'Bài đăng sau một ngày nhưng ghi rõ họp báo diễn ra ngày 5/5, nên không gây lệch về thời điểm. Điểm thêm là góc nhìn từ đại diện WHO tại Việt Nam.',
    judgeNotes: [
      'Ngày đăng là 6/5, nhưng ngày tuyên bố trong bài là 5/5, đúng với nhận định.',
      'Tôi đánh giá cao việc bài giữ rõ khác biệt giữa hết tình trạng khẩn cấp và hết mối đe dọa.',
    ],
  },

  // Fictional sources
  'mcta-release': {
    summary: 'The transit authority announces that passenger service began on 18 March 2024 between Quayside and Northgate.',
    keyPoints: ['Trains ran every eight minutes on opening day.', 'The announcement is dated the same day service began.'],
    assessment: 'The operator’s own announcement is reliable on a basic fact like its opening date, and it gives the exact day.',
    judgeNotes: [
      'The date falls in March 2024, so it supports the claim directly.',
      'Agreed. It helps that a separate newspaper report describes the same morning.',
    ],
  },
  'ledger-opening': {
    summary: 'A local newspaper describes riders queuing at Quayside as the first public train left on Monday morning.',
    keyPoints: ['The first public service departed shortly after 6 a.m.', 'The report comes from the station on opening day.'],
    assessment: 'An independent account of the same event, so it strengthens the operator’s statement.',
    judgeNotes: [
      'An eyewitness-style report, dated 18 March 2024. Supports the claim.',
      'It doesn’t rely on the transit authority’s wording, which is what makes it useful.',
    ],
  },
  'ridership-report': {
    summary: 'The transit authority’s six-month summary puts average weekday boardings at 31,400 in September 2024.',
    keyPoints: ['Weekends were lower, at roughly 18,000 boardings a day.', 'The figures cover the period the claim refers to.'],
    assessment: 'The operator’s own numbers fall well short of 50,000, and an operator has no reason to understate its ridership.',
    judgeNotes: [
      'A figure of 31,400 can’t be squared with 50,000 daily trips, so I read this as contradicting the claim.',
      'The figure is low, but boardings and trips may not be counted the same way. I would call the evidence insufficient for a firm verdict.',
    ],
  },
  'ledger-target': {
    summary: 'A local newspaper explains that 50,000 daily trips was a long-term planning goal, expected by the end of the decade.',
    keyPoints: ['The article predates the opening.', 'It doesn’t report any actual ridership.'],
    assessment: 'It can’t show what ridership reached, but it does suggest where the 50,000 figure came from.',
    judgeNotes: [
      'This points to the claim mixing up a target with a result.',
      'A likely explanation, not proof. The article doesn’t say whether the target was later revised.',
    ],
  },
  'mcta-budget': {
    summary: 'The transit authority says the line was delivered on schedule and within the approved programme budget.',
    keyPoints: ['The statement doesn’t give a figure.', 'It predates the city’s audit.'],
    assessment: 'Supportive on its face, but “approved programme budget” isn’t the same thing as the original budget in the claim.',
    judgeNotes: [
      'I read this as supporting the claim, though the wording is general, so my confidence is moderate.',
      'Also supportive, but it would be worth checking which budget the release means.',
    ],
  },
  audit: {
    summary: 'The city’s audit gives the original budget as $1.2 billion, the amended budget as $1.38 billion and the final cost as $1.34 billion.',
    keyPoints: ['Two scope amendments raised the approved budget.', 'The final cost is above the original budget the claim names.'],
    assessment: 'An audit with exact figures is the strongest source here, and its numbers contradict the claim.',
    judgeNotes: [
      'A final cost of $1.34 billion is above $1.2 billion, which undercuts the claim. My verdict relied on the release and didn’t account for this.',
      'I agree that this outweighs the transit authority’s general statement. A human review is the right call here.',
    ],
  },
  'council-minutes': {
    summary: 'Council minutes record anecdotal reports of lighter traffic, and staff saying no figures exist yet.',
    keyPoints: ['A traffic count study was scheduled for spring 2025.', 'The minutes don’t quote a one-third reduction.'],
    assessment: 'It neither confirms nor refutes the claim, and its status may have changed since October 2024.',
    judgeNotes: [
      'No figure appears, so there isn’t enough evidence for a verdict either way.',
      'Agreed. The spring 2025 study would be the source to look for next.',
    ],
  },
};

// Each judge's simulated scores out of 100, in `ratingCriteria` order: match, directness, timing, detail.
// They follow the notes above: a report written before the event scores low on directness and timing, and a source
// that contradicts the claim scores low on match even when it is direct and detailed.
export const sourceRatings: Record<string, number[][]> = {
  'vnexpress-metro': [[96, 92, 98, 88], [88, 90, 98, 85]],
  'baochinhphu-metro': [[95, 94, 98, 84], [93, 90, 98, 86]],
  'vir-metro': [[95, 90, 98, 88], [92, 88, 98, 90]],
  'cand-metro': [[94, 90, 97, 86], [94, 92, 97, 90]],
  'nhandan-metro': [[80, 30, 35, 72], [82, 25, 35, 78]],
  'who-remarks': [[99, 99, 100, 90], [97, 99, 100, 92]],
  'yle-emergency': [[90, 60, 96, 45], [85, 45, 96, 30]],
  'nhadautu-metro-vi': [[94, 92, 98, 62], [86, 90, 98, 60]],
  'vietnamfinance-metro-vi': [[92, 86, 98, 84], [78, 82, 98, 86]],
  'baophapluat-metro-vi': [[93, 90, 88, 92], [95, 90, 88, 92]],
  'vietnamplus-metro-vi': [[78, 25, 40, 40], [80, 30, 40, 38]],
  'nhandan-metro-vi': [[80, 28, 35, 72], [82, 25, 35, 78]],
  'vnexpress-who-vi': [[95, 85, 96, 84], [88, 82, 90, 86]],
  'vietnamplus-who-vi': [[96, 85, 98, 82], [94, 85, 98, 86]],
  'nhandan-who-vi': [[94, 84, 96, 86], [92, 82, 96, 88]],
  'baochinhphu-who-vi': [[94, 84, 85, 80], [95, 84, 85, 86]],
  'mcta-release': [[96, 92, 98, 70], [94, 90, 98, 70]],
  'ledger-opening': [[94, 88, 98, 68], [95, 90, 98, 70]],
  'ridership-report': [[8, 92, 90, 90], [25, 70, 90, 85]],
  'ledger-target': [[30, 45, 30, 55], [35, 35, 30, 55]],
  'mcta-budget': [[72, 50, 55, 25], [65, 45, 55, 25]],
  audit: [[6, 96, 92, 98], [10, 95, 92, 98]],
  'council-minutes': [[20, 25, 45, 30], [20, 25, 40, 30]],
};
