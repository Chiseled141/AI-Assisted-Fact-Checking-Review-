// The example buttons on the home page. They only fill in the form, so they work in demo and real mode.

import type { InputType } from '../types/models';

export const REAL_EXAMPLE_INPUT_VI =
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
      'Marlow City’s Harbor Line light rail opened to passengers in March 2024. Ridership reached 50,000 daily trips within its first six months, and the line was completed under its original budget of $1.2 billion. City officials say it has reduced downtown traffic congestion by a third.',
    valueVi: REAL_EXAMPLE_INPUT_VI,
  },
  {
    id: 'news-url',
    label: 'News URL',
    inputType: 'url',
    value: 'https://example.org/marlow-ledger/2024/10/harbor-line-six-months',
    valueVi: 'https://vnexpress.net/who-tuyen-bo-covid-19-khong-con-la-tinh-trang-y-te-khan-cap-toan-cau-4601715.html',
  },
  {
    id: 'budget-text',
    label: 'Budget claim',
    inputType: 'text',
    value:
      'The Harbor Line was finished under budget, costing less than the $1.2 billion originally approved by the city council.',
    valueVi: 'Dự án đường sắt đô thị Cát Linh - Hà Đông đã hoàn thành trong tổng mức đầu tư được phê duyệt ban đầu.',
  },
];
