// Example inputs only fill the form. Submitting one starts a new check through the backend.
// One for each way in: an article link, a news fact, and a price.

import type { LucideIcon } from 'lucide-react';
import { ChartLine, Link2, Newspaper } from 'lucide-react';
import type { InputType } from '../types/models';

const WHO_ARTICLE = 'https://vnexpress.net/who-tuyen-bo-covid-19-khong-con-la-tinh-trang-y-te-khan-cap-toan-cau-4601715.html';

interface ExampleInput {
  id: string;
  label: string;
  icon: LucideIcon;
  inputType: InputType;
  value: string;
  /** What the example fills in when the interface is in Vietnamese. */
  valueVi: string;
}

export const exampleInputs: ExampleInput[] = [
  {
    id: 'check-url',
    label: 'Check a link',
    icon: Link2,
    inputType: 'url',
    value: WHO_ARTICLE,
    valueVi: WHO_ARTICLE,
  },
  {
    id: 'verify-news',
    label: 'Verify a news fact',
    icon: Newspaper,
    inputType: 'text',
    value: 'Hanoi’s Cát Linh - Hà Đông metro began commercial service on 6 November 2021.',
    valueVi: 'Tuyến đường sắt đô thị Cát Linh - Hà Đông chính thức vận hành thương mại ngày 6/11/2021.',
  },
  {
    id: 'confirm-price',
    label: 'Confirm a price',
    icon: ChartLine,
    inputType: 'text',
    value: 'Bitcoin passed 100,000 US dollars for the first time in December 2024.',
    valueVi: 'Bitcoin lần đầu vượt mốc 100.000 USD vào tháng 12/2024.',
  },
];
