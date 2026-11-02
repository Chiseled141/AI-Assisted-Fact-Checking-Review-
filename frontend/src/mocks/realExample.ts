// REAL SOURCES, SIMULATED ASSESSMENT.
// Unlike fixtures.ts, these titles, publishers, dates, URLs, images, and excerpts are real.
// Images are each article's og:image, loaded from the publisher; none are stored in this repo. Each excerpt was
// checked word for word against its page on 2 November 2026; keep them short and do not reword them.
// The verdicts, rationales, and each judge's confidence and review are still simulated: no AI call produced them.

import type { FixtureClaim } from './fixtures';

const SIMULATED_AUTHOR = 'ClaimTrace assessment model (simulated)';

export const REAL_EXAMPLE_INPUT =
  'Hanoi’s Cát Linh–Hà Đông metro line began commercial operation on 6 November 2021. WHO declared COVID-19 over as a global health emergency on 5 May 2023.';

export const realExampleClaims: FixtureClaim[] = [
  {
    key: 'hanoi-metro',
    topic: 'the November 2021 metro opening',
    text: 'Hanoi’s Cát Linh–Hà Đông metro line began commercial operation on 6 November 2021.',
    timeContext: 'November 2021',
    evidence: [
      {
        key: 'vnexpress-metro',
        publishedAt: '2021-11-06',
        sourceTitle: 'Hanoi gets country’s 1st metro service',
        publisher: 'VnExpress International',
        url: 'https://e.vnexpress.net/news/business/economy/hanoi-gets-country-s-1st-metro-service-4382113.html',
        excerpt: 'The Cat Linh - Ha Dong metro line in Hanoi began commercial operation Saturday morning',
        relation: 'supporting',
        imageUrl:
          'https://i1-english.vnecdn.net/2021/11/06/10JPG163600595334961636128674-3942-7660-1636133850.jpg?w=680&h=0&q=100&dpr=1&fit=crop&s=cjzhFYBICrJhiwty3OA2kA',
        noCapture: true,
      },
      {
        key: 'baochinhphu-metro',
        publishedAt: '2021-11-06',
        sourceTitle: 'First metro line begins operation',
        publisher: 'Báo Chính phủ',
        url: 'https://en.baochinhphu.vn/first-metro-line-begins-operation-11142669.htm',
        excerpt: 'put into operation in the capital city of Ha Noi on Saturday morning',
        relation: 'supporting',
        imageUrl:
          'https://bcp.cdnchinhphu.vn/zoom/1200_630/Uploaded_VGP/vuthuydung/20211106/anhtau.jpg',
        noCapture: true,
      },
      {
        key: 'vir-metro',
        publishedAt: '2021-11-06',
        sourceTitle: 'Cat Linh-Ha Dong metro line starts commercial operation after years of delays',
        publisher: 'Vietnam Investment Review',
        url: 'https://vir.com.vn/cat-linh-ha-dong-metro-line-starts-commercial-operation-after-years-of-delays-89003.html',
        excerpt: 'officially put into commercial operation today after 10 years of construction',
        relation: 'supporting',
        imageUrl:
          'https://vir.com.vn/stores/news_dataimages/bichthuy/112021/06/15/in_social/the-cat-linh-ha-dong-metro-line-was-put-into-commercial-run-on-november-6.jpg',
        noCapture: true,
      },
      {
        key: 'cand-metro',
        publishedAt: '2021-11-06',
        sourceTitle: 'Cat Linh – Ha Dong metro line starts commercial operation',
        publisher: 'Công an nhân dân',
        url: 'https://en.cand.com.vn/law-society/cat-linh--ha-dong-metro-line-starts-commercial-operation--i590587',
        excerpt: 'Hanoi administration for commercial operation on November 6',
        relation: 'supporting',
        imageUrl:
          'https://en-cdn.cand.vn/images/ZSJhIQrXWIbeoQ8nJF-yCtDwJ2Smwf5i1N85GvH3mwCz0l7-taq6BCUyLlIRdSRfVolfcEmh4eR2TMH0PgZKRy2HEFL7JFigLjOGo9JYqy8/1_1636181963941-1636198608568.jpg.webp',
        noCapture: true,
      },
      {
        key: 'nhandan-metro',
        publishedAt: '2021-11-04',
        sourceTitle: 'Ngày 6/11, chính thức khai thác thương mại tuyến đường sắt Cát Linh - Hà Đông',
        publisher: 'Nhân Dân',
        url: 'https://nhandan.vn/ngay-611-chinh-thuc-khai-thac-thuong-mai-tuyen-duong-sat-cat-linh-ha-dong-post672501.html',
        excerpt: 'đúng 7 giờ ngày 6/11 … chính thức khai thác vận hành thương mại',
        relation: 'contextual',
        imageUrl:
          'https://cdn.nhandan.vn/images/IvCZyovHroGqKo00FqhL-PX2VqFun5eErDDWEWUZIvwgV04SC_pJudB8bmGK6Skja2-EwsNANxJA5HACqYgrkLT_oTDsE3W9TaGKikjeyM4/CL_HD_1-1636019608340.JPG.webp',
        noCapture: true,
      },
    ],
    revisions: [
      {
        kind: 'ai_assessment',
        verdict: 'supported',
        rationale:
          'Four reports published on 6 November 2021 describe the line entering commercial operation that day. A Nhân Dân article from two days earlier gave the same planned date.',
        cites: ['vnexpress-metro', 'baochinhphu-metro', 'vir-metro', 'cand-metro'],
        freshness: {
          'vnexpress-metro': { status: 'current' },
          'baochinhphu-metro': { status: 'current' },
          'vir-metro': { status: 'current' },
          'cand-metro': { status: 'current' },
        },
        judges: [
          { verdict: 'supported', confidence: 0.95 },
          {
            verdict: 'supported',
            confidence: 0.92,
            review:
              'The date holds up: reports dated 6 November 2021 agree on it, and a plan published two days earlier matches them. One caveat is that rides were free for the first 15 days, so “commercial” here means open to the public, not yet charging fares.',
          },
        ],
        author: SIMULATED_AUTHOR,
        offsetMinutes: 1,
      },
    ],
  },
  {
    key: 'who-emergency',
    topic: 'the May 2023 end of the emergency',
    text: 'WHO declared COVID-19 over as a global health emergency on 5 May 2023.',
    timeContext: 'May 2023',
    evidence: [
      {
        key: 'who-remarks',
        publishedAt: '2023-05-05',
        sourceTitle: 'WHO Director-General’s opening remarks at the media briefing – 5 May 2023',
        publisher: 'World Health Organization',
        url: 'https://www.who.int/news-room/speeches/item/who-director-general-s-opening-remarks-at-the-media-briefing---5-may-2023',
        excerpt: 'I declare COVID-19 over as a global health emergency',
        relation: 'supporting',
        imageUrl:
          'https://cdn.who.int/media/images/default-source/campaigns---annual-theme/annual-theme/year-of-the-nurse-and-the-midwife/who-dr-tedros-portrait-11aug2017-0102.tmb-1200v.jpg?sfvrsn=2ccc89d4_30',
        noCapture: true,
      },
      {
        key: 'yle-emergency',
        publishedAt: '2023-05-05',
        sourceTitle: 'A monumental moment: End of international emergency',
        publisher: 'Your Local Epidemiologist',
        url: 'https://yourlocalepidemiologist.substack.com/p/a-monumental-moment-end-of-international',
        excerpt: 'declared the end of the Public Health Emergency of International Concern',
        relation: 'supporting',
        // No imageUrl: this article's preview image is a screenshot of text, which clashes with the title.
        noCapture: true,
      },
    ],
    revisions: [
      {
        kind: 'ai_assessment',
        verdict: 'supported',
        rationale:
          'The WHO Director-General made the declaration in remarks dated 5 May 2023. A newsletter published the same day reports the same decision.',
        cites: ['who-remarks', 'yle-emergency'],
        freshness: { 'who-remarks': { status: 'current' }, 'yle-emergency': { status: 'current' } },
        judges: [
          { verdict: 'supported', confidence: 0.97 },
          {
            verdict: 'supported',
            confidence: 0.95,
            review:
              'The WHO transcript settles this alone, because it is the declaration itself. The wording matters: the emergency status ended, while the Director-General says the threat did not.',
          },
        ],
        author: SIMULATED_AUTHOR,
        offsetMinutes: 1,
      },
    ],
  },
];

// The Vietnamese version: Vietnamese-language articles from Vietnamese newspapers, checked the same way.

const SIMULATED_AUTHOR_VI = 'Mô hình đánh giá ClaimTrace (mô phỏng)';

export const REAL_EXAMPLE_INPUT_VI =
  'Tuyến đường sắt đô thị Cát Linh - Hà Đông chính thức vận hành thương mại ngày 6/11/2021. WHO tuyên bố COVID-19 không còn là tình trạng khẩn cấp y tế toàn cầu ngày 5/5/2023.';

export const realExampleClaimsVi: FixtureClaim[] = [
  {
    key: 'hanoi-metro-vi',
    text: 'Tuyến đường sắt đô thị Cát Linh - Hà Đông chính thức vận hành thương mại ngày 6/11/2021.',
    topic: 'việc khai thác tuyến Cát Linh - Hà Đông tháng 11/2021',
    timeContext: 'Tháng 11/2021',
    evidence: [
      {
        key: 'nhadautu-metro-vi',
        publishedAt: '2021-11-06',
        sourceTitle: '[Ảnh] Người dân Hà Nội háo hức lên chuyến tàu Cát Linh - Hà Đông đầu tiên',
        publisher: 'Nhà Đầu tư',
        url: 'https://nhadautu.vn/anh-nguoi-dan-ha-noi-hao-huc-len-chuyen-tau-cat-linh--ha-dong-dau-tien-d60022.html',
        excerpt: 'Cát Linh - Hà Đông đã chính thức khai thác thương mại',
        relation: 'supporting',
        imageUrl:
          'https://t.ex-cdn.com/nhadautu.vn/560w/files/news/2021/11/06/anh-nguoi-dan-ha-noi-phan-khoi-len-chuyen-tau-cat-linh--ha-dong-dau-tien-095316.jpg',
        noCapture: true,
      },
      {
        key: 'vietnamfinance-metro-vi',
        publishedAt: '2021-11-06',
        sourceTitle: 'Chính thức vận hành thương mại đường sắt Cát Linh - Hà Đông',
        publisher: 'VietnamFinance',
        url: 'https://vietnamfinance.vn/chinh-thuc-van-hanh-thuong-mai-duong-sat-cat-linh--ha-dong-d72620.html',
        excerpt: 'Sáng 6/11, Bộ Giao thông Vận tải chính thức tổ chức lễ bàn giao',
        relation: 'supporting',
        imageUrl: 'https://t.ex-cdn.com/vietnamfinance.vn/960w/files/f1/news/vananh/2021/11/6/56-dkcv-1521034048.jpg',
        noCapture: true,
      },
      {
        key: 'baophapluat-metro-vi',
        publishedAt: '2021-11-07',
        sourceTitle: 'Miễn phí ngắm phố trên cao, metro Cát Linh - Hà Đông đang "hút" khách',
        publisher: 'Báo Pháp luật Việt Nam',
        url: 'https://baophapluat.vn/mien-phi-ngam-pho-tren-cao-metro-cat-linh-ha-dong-dang-hut-khach-post420691.html',
        excerpt: 'Trong ngày đầu vận hành thương mại (từ 8h - 22h ngày 6/11)',
        relation: 'supporting',
        imageUrl: 'https://cdn.baophapluat.vn/uploaded/minhhuu/2021_11_07/20211106-080628-53.jpg',
        noCapture: true,
      },
      {
        key: 'vietnamplus-metro-vi',
        publishedAt: '2021-11-05',
        sourceTitle: 'Bàn giao, khánh thành dự án đường sắt Cát Linh-Hà Đông vào ngày 6/11',
        publisher: 'VietnamPlus',
        url: 'https://www.vietnamplus.vn/ban-giao-khanh-thanh-du-an-duong-sat-cat-linh-ha-dong-vao-ngay-611-post752217.vnp',
        excerpt: 'Theo kế hoạch, 7h sáng ngày 6/11',
        relation: 'contextual',
        imageUrl:
          'https://media.vietnamplus.vn/images/wU9keeg-MVtM86KQbMalHptMH7mEOWljy-CYtlzFMDKjNM6NqYVi_TEN4fLA8IDTvF0irsR7XgUO7VPqKgEduQ/0511catlinh2.jpg.webp',
        noCapture: true,
      },
      {
        key: 'nhandan-metro-vi',
        publishedAt: '2021-11-04',
        sourceTitle: 'Ngày 6/11, chính thức khai thác thương mại tuyến đường sắt Cát Linh - Hà Đông',
        publisher: 'Nhân Dân',
        url: 'https://nhandan.vn/ngay-611-chinh-thuc-khai-thac-thuong-mai-tuyen-duong-sat-cat-linh-ha-dong-post672501.html',
        excerpt: 'đúng 7 giờ ngày 6/11 … chính thức khai thác vận hành thương mại',
        relation: 'contextual',
        imageUrl:
          'https://cdn.nhandan.vn/images/IvCZyovHroGqKo00FqhL-PX2VqFun5eErDDWEWUZIvwgV04SC_pJudB8bmGK6Skja2-EwsNANxJA5HACqYgrkLT_oTDsE3W9TaGKikjeyM4/CL_HD_1-1636019608340.JPG.webp',
        noCapture: true,
      },
    ],
    revisions: [
      {
        kind: 'ai_assessment',
        verdict: 'supported',
        rationale:
          'Các báo đăng ngày 6 và 7/11/2021 cho biết tuyến đã bàn giao và đi vào khai thác thương mại trong ngày 6/11. Hai bài đăng trước đó cũng nêu cùng mốc thời gian theo kế hoạch.',
        cites: ['nhadautu-metro-vi', 'vietnamfinance-metro-vi', 'baophapluat-metro-vi'],
        freshness: {
          'nhadautu-metro-vi': { status: 'current' },
          'vietnamfinance-metro-vi': { status: 'current' },
          'baophapluat-metro-vi': { status: 'current' },
        },
        judges: [
          { verdict: 'supported', confidence: 0.95 },
          {
            verdict: 'supported',
            confidence: 0.92,
            review:
              'Mốc 6/11/2021 được nhiều báo xác nhận, và số khách của ngày đầu cho thấy tuyến đã thực sự chạy. Cần lưu ý rằng 15 ngày đầu tàu chạy miễn phí, nên “thương mại” ở đây nên hiểu là đã mở cho công chúng, chưa thu vé.',
          },
        ],
        author: SIMULATED_AUTHOR_VI,
        offsetMinutes: 1,
      },
    ],
  },
  {
    key: 'who-emergency-vi',
    text: 'WHO tuyên bố COVID-19 không còn là tình trạng khẩn cấp y tế toàn cầu ngày 5/5/2023.',
    topic: 'việc WHO kết thúc tình trạng khẩn cấp tháng 5/2023',
    timeContext: 'Tháng 5/2023',
    failsInPartialScenario: true,
    evidence: [
      {
        key: 'vnexpress-who-vi',
        publishedAt: '2023-05-05',
        sourceTitle: 'WHO tuyên bố Covid-19 không còn là tình trạng y tế khẩn cấp toàn cầu',
        publisher: 'VnExpress',
        url: 'https://vnexpress.net/who-tuyen-bo-covid-19-khong-con-la-tinh-trang-y-te-khan-cap-toan-cau-4601715.html',
        excerpt: 'tuyên bố đại dịch Covid-19 không còn là tình trạng khẩn cấp y tế toàn cầu',
        relation: 'supporting',
        imageUrl:
          'https://i1-suckhoe.vnecdn.net/2023/05/05/32373ldhighres73341683183426-1-3409-2856-1683301611.jpg?w=1200&h=675&q=100&dpr=1&fit=crop&s=OCSKTydK53S5zuV7PfBUlA',
        noCapture: true,
      },
      {
        key: 'vietnamplus-who-vi',
        publishedAt: '2023-05-05',
        sourceTitle: 'WHO tuyên bố chấm dứt tình trạng khẩn cấp y tế toàn cầu do COVID-19',
        publisher: 'VietnamPlus',
        url: 'https://www.vietnamplus.vn/who-tuyen-bo-cham-dut-tinh-trang-khan-cap-y-te-toan-cau-do-covid-19-post860923.vnp',
        excerpt: 'chính thức tuyên bố đại dịch COVID-19 không còn là tình trạng khẩn cấp',
        relation: 'supporting',
        imageUrl:
          'https://media.vietnamplus.vn/images/wU9keeg-MVtM86KQbMalHrMTQJhf7fPrtfTOa1G26M0TXTLTJTYqWm8SIK8vtVB9ujMDfvx6F70N_x8slNRiGadPaxv-cLMgN3LHl5Agzvo/Ghebreyesus_covid.jpg.webp',
        noCapture: true,
      },
      {
        key: 'nhandan-who-vi',
        publishedAt: '2023-05-05',
        sourceTitle: 'WHO: Covid-19 không còn là tình trạng khẩn cấp y tế toàn cầu',
        publisher: 'Nhân Dân',
        url: 'https://nhandan.vn/who-covid-19-khong-con-la-tinh-trang-khan-cap-y-te-toan-cau-post751278.html',
        excerpt: 'tôi có thể tuyên bố chấm dứt tình trạng khẩn cấp về sức khỏe cộng đồng',
        relation: 'supporting',
        imageUrl:
          'https://cdn.nhandan.vn/images/IvCZyovHroGqKo00FqhL-AWneogv2bdQVPQNWJvEX-NTrnORw0zG4tMZD0WJjG8R7DnRJSD-DdSoev9vKpG_Og/covid-4950.jpg.webp',
        noCapture: true,
      },
      {
        key: 'baochinhphu-who-vi',
        publishedAt: '2023-05-06',
        sourceTitle: 'COVID-19 không còn là tình trang khẩn cấp về y tế toàn cầu',
        publisher: 'Báo Chính phủ',
        url: 'https://baochinhphu.vn/covid-19-khong-con-la-tinh-trang-khan-cap-ve-y-te-toan-cau-102230506141357589.htm',
        excerpt: 'vừa tuyên bố COVID-19 không còn là tình trạng khẩn cấp về y tế toàn cầu',
        relation: 'supporting',
        imageUrl:
          'https://bcp2.cdnchinhphu.vn/zoom/1200_630/334894974524682240/2023/5/6/omicronkhiennguoimoikhoicovid-19vancothebitainhiemnhieulan-16833571050172341333-0-0-675-1080-crop-16833571274622049461322.jpg',
        noCapture: true,
      },
    ],
    revisions: [
      {
        kind: 'ai_assessment',
        verdict: 'supported',
        rationale:
          'Bốn báo Việt Nam cùng đưa tin Tổng Giám đốc WHO đã đưa ra tuyên bố này. Ba bài đăng ngày 5/5/2023, cùng ngày với tuyên bố, và không có nguồn nào mâu thuẫn về thời điểm.',
        cites: ['vnexpress-who-vi', 'vietnamplus-who-vi', 'nhandan-who-vi', 'baochinhphu-who-vi'],
        freshness: {
          'vnexpress-who-vi': { status: 'current' },
          'vietnamplus-who-vi': { status: 'current' },
          'nhandan-who-vi': { status: 'current' },
          'baochinhphu-who-vi': { status: 'current' },
        },
        judges: [
          { verdict: 'supported', confidence: 0.97 },
          {
            verdict: 'supported',
            confidence: 0.95,
            review:
              'Các báo thống nhất về ngày 5/5/2023 và đều thuật lại tuyên bố của ông Tedros. Cũng cần phân biệt rằng tình trạng khẩn cấp đã chấm dứt, nhưng COVID-19 vẫn là mối đe dọa.',
          },
        ],
        author: SIMULATED_AUTHOR_VI,
        offsetMinutes: 1,
      },
    ],
  },
];

// The result-page examples for a URL and for a file.

const [metroClaimVi, whoClaimVi] = realExampleClaimsVi;
const CHECKED_ARTICLE_KEY = 'vnexpress-who-vi';

/** The WHO claim as checked from the VnExpress article, so that article can't count as its own evidence. */
export const urlExampleClaimsVi: FixtureClaim[] = [
  {
    ...whoClaimVi,
    evidence: whoClaimVi.evidence.filter((item) => item.key !== CHECKED_ARTICLE_KEY),
    revisions: whoClaimVi.revisions.map((revision) => {
      const { [CHECKED_ARTICLE_KEY]: _checked, ...freshness } = revision.freshness ?? {};
      return {
        ...revision,
        rationale:
          'Ba báo khác cùng đưa tin Tổng Giám đốc WHO đã đưa ra tuyên bố này. Hai bài đăng ngày 5/5/2023, cùng ngày với tuyên bố, và không có nguồn nào mâu thuẫn về thời điểm.',
        cites: revision.cites.filter((key) => key !== CHECKED_ARTICLE_KEY),
        freshness,
      };
    }),
  },
];

const checkedArticleVi = whoClaimVi.evidence.find((item) => item.key === CHECKED_ARTICLE_KEY)!;
export const urlExampleArticleVi = {
  title: checkedArticleVi.sourceTitle,
  publisher: checkedArticleVi.publisher,
  publishedAt: checkedArticleVi.publishedAt,
};

export const fileExampleClaimsVi: FixtureClaim[] = [metroClaimVi];

// A made-up file for the demo. Its one factual sentence is the claim above.
const FILE_EXAMPLE_TEXT_VI = `Ghi chú ví dụ về giao thông Hà Nội

Tuyến đường sắt đô thị Cát Linh - Hà Đông chính thức vận hành thương mại ngày 6/11/2021.

Tệp này chỉ dùng để minh họa trong bản demo.
`;

export const fileExampleVi = {
  name: 'ghi-chu-giao-thong-ha-noi.txt',
  size: new TextEncoder().encode(FILE_EXAMPLE_TEXT_VI).length,
  text: FILE_EXAMPLE_TEXT_VI,
};
