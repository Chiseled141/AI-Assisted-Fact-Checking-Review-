// Example inputs only fill the form. Submitting one starts a new check through the backend.

import type { InputType } from '../types/models';

const TRANSIT_INPUT_VI =
  'Tuyến đường sắt đô thị Cát Linh - Hà Đông chính thức vận hành thương mại ngày 6/11/2021. WHO tuyên bố COVID-19 không còn là tình trạng khẩn cấp y tế toàn cầu ngày 5/5/2023.';

export interface ExampleInput {
  id: string;
  label: string;
  inputType: InputType;
  value: string;
  /** What the example fills in when the interface is in Vietnamese. */
  valueVi: string;
}

export const exampleInputs: ExampleInput[] = [
  {
    id: 'transit-text',
    label: 'Transit news',
    inputType: 'text',
    value:
      'Hanoi’s Cát Linh - Hà Đông metro began commercial service on 6 November 2021. WHO declared that COVID-19 was no longer a global public health emergency on 5 May 2023.',
    valueVi: TRANSIT_INPUT_VI,
  },
  {
    id: 'news-url',
    label: 'News URL',
    inputType: 'url',
    value: 'https://vnexpress.net/who-tuyen-bo-covid-19-khong-con-la-tinh-trang-y-te-khan-cap-toan-cau-4601715.html',
    valueVi: 'https://vnexpress.net/who-tuyen-bo-covid-19-khong-con-la-tinh-trang-y-te-khan-cap-toan-cau-4601715.html',
  },
  {
    id: 'budget-text',
    label: 'Budget claim',
    inputType: 'text',
    value:
      'Hanoi’s Cát Linh - Hà Đông metro was completed within its initially approved budget.',
    valueVi: 'Dự án đường sắt đô thị Cát Linh - Hà Đông đã hoàn thành trong tổng mức đầu tư được phê duyệt ban đầu.',
  },
];
