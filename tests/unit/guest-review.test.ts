import { describe, expect, test } from 'bun:test';
import {
  answerFor,
  attendanceMarker,
  attendanceVariant,
  currentAttendanceLabel,
  displayAnswer,
  historyAttendanceLabel,
  humanStatus,
  questionTypeLabel
} from '../../src/lib/guest-review';

describe('guest review helpers', () => {
  test('labels current attendance from checked-in and approval status', () => {
    expect(
      currentAttendanceLabel({
        approval_status: 'approved',
        checked_in_at: '2026-05-13T18:00:00.000Z'
      })
    ).toBe('checked in');

    expect(
      currentAttendanceLabel({
        approval_status: 'approved',
        checked_in_at: null
      })
    ).toBe('going');

    expect(
      currentAttendanceLabel({
        approval_status: 'pending_approval',
        checked_in_at: null
      })
    ).toBe('pending approval');
  });

  test('labels prior event history pills', () => {
    const base = {
      event_name: 'Builder Night',
      event_url: null,
      event_start_at: '2026-05-10T18:00:00.000Z',
      event_end_at: null,
      registered_at: null,
      ticket_name: null
    };

    expect(
      historyAttendanceLabel({
        ...base,
        approval_status: 'approved',
        status_internal: 'approved',
        checked_in_at: '2026-05-10T18:10:00.000Z'
      })
    ).toBe('went');

    expect(
      historyAttendanceLabel({
        ...base,
        approval_status: 'going',
        status_internal: 'approved',
        checked_in_at: null
      })
    ).toBe('going');

    expect(
      historyAttendanceLabel({
        ...base,
        approval_status: 'pending_approval',
        status_internal: 'needs_review',
        checked_in_at: null
      })
    ).toBe('pending approval');
  });

  test('maps attendance labels to badge variants', () => {
    expect(attendanceVariant('checked in')).toBe('secondary');
    expect(attendanceVariant('went')).toBe('secondary');
    expect(attendanceVariant('going')).toBe('default');
    expect(attendanceVariant('declined')).toBe('destructive');
    expect(attendanceVariant('pending approval')).toBe('outline');
  });

  test('maps attendance labels to compact history markers', () => {
    expect(attendanceMarker('went')).toEqual({
      tone: 'checked_in',
      shape: 'square',
      shortLabel: 'went'
    });
    expect(attendanceMarker('checked in')).toEqual({
      tone: 'checked_in',
      shape: 'square',
      shortLabel: 'in'
    });
    expect(attendanceMarker('going')).toEqual({
      tone: 'going',
      shape: 'circle',
      shortLabel: 'going'
    });
    expect(attendanceMarker('pending approval')).toEqual({
      tone: 'pending',
      shape: 'outline',
      shortLabel: 'pending'
    });
  });

  test('formats statuses and question type labels', () => {
    expect(humanStatus('pending_approval')).toBe('pending approval');
    expect(humanStatus(null)).toBe('unknown');
    expect(questionTypeLabel('multi_select')).toBe('multi select');
    expect(questionTypeLabel(null)).toBe('answer');
  });

  test('matches dynamic answer columns by question key first', () => {
    const answers = [
      {
        question_key: 'q1',
        question: 'Profile',
        question_type: 'url',
        answer: 'https://github.com/example'
      },
      {
        question_key: 'q2',
        question: 'Profile',
        question_type: 'url',
        answer: 'https://linkedin.com/in/example'
      }
    ];

    expect(
      answerFor(answers, {
        question_key: 'q2',
        question: 'Profile',
        question_type: 'url'
      })?.answer
    ).toBe('https://linkedin.com/in/example');
  });

  test('falls back to question text for answer columns without keys', () => {
    const answers = [
      {
        question_key: null,
        question: 'What are you building?',
        question_type: null,
        answer: 'A review console'
      }
    ];

    expect(
      answerFor(answers, {
        question_key: null,
        question: 'What are you building?',
        question_type: null
      })?.answer
    ).toBe('A review console');
  });

  test('displays native Luma company answers without raw JSON', () => {
    expect(
      displayAnswer(
        {
          question_key: 'company',
          question: 'What company do you work for?',
          question_type: 'company',
          answer: '{"company":null,"job_title":"Designer"}'
        },
        {
          question_key: 'company',
          question: 'What company do you work for?',
          question_type: 'company'
        }
      )
    ).toEqual({
      primary: 'Designer',
      secondary: null,
      href: null,
      kind: 'company'
    });

    expect(
      displayAnswer(
        {
          question_key: 'company',
          question: 'What company do you work for?',
          question_type: 'company',
          answer: '{"company":{"name":"OpenAI"},"job_title":"Engineer"}'
        },
        {
          question_key: 'company',
          question: 'What company do you work for?',
          question_type: 'company'
        }
      )
    ).toEqual({
      primary: 'OpenAI',
      secondary: 'Engineer',
      href: null,
      kind: 'company'
    });
  });

  test('uses native Luma company metadata to show job title in the company column', () => {
    expect(
      displayAnswer(
        {
          question_key: 'company',
          question: 'What company do you work for?',
          question_type: 'company',
          answer: 'OpenAI',
          raw_json: {
            answer: '{"company":{"name":"OpenAI"},"job_title":"Research Engineer"}'
          }
        },
        {
          question_key: 'company',
          question: 'What company do you work for?',
          question_type: 'company'
        }
      )
    ).toEqual({
      primary: 'OpenAI',
      secondary: 'Research Engineer',
      href: null,
      kind: 'company'
    });

    expect(
      displayAnswer(
        {
          question_key: 'company',
          question: 'What company do you work for?',
          question_type: 'company',
          answer: 'N/A',
          raw_json: {
            value: {
              company: null,
              job_title: 'Designer'
            }
          }
        },
        {
          question_key: 'company',
          question: 'What company do you work for?',
          question_type: 'company'
        }
      )
    ).toEqual({
      primary: 'Designer',
      secondary: null,
      href: null,
      kind: 'company'
    });
  });

  test('displays native GitHub and LinkedIn answers as links', () => {
    expect(
      displayAnswer(
        {
          question_key: 'github',
          question: 'What is your GitHub username?',
          question_type: 'github',
          answer: 'octocat'
        },
        {
          question_key: 'github',
          question: 'What is your GitHub username?',
          question_type: 'github'
        }
      )
    ).toMatchObject({
      primary: 'octocat',
      href: 'https://github.com/octocat',
      kind: 'link'
    });

    expect(
      displayAnswer(
        {
          question_key: 'linkedin',
          question: 'What is your LinkedIn profile?',
          question_type: 'linkedin',
          answer: '/in/person'
        },
        {
          question_key: 'linkedin',
          question: 'What is your LinkedIn profile?',
          question_type: 'linkedin'
        }
      )
    ).toMatchObject({
      primary: '/in/person',
      href: 'https://www.linkedin.com/in/person',
      kind: 'link'
    });
  });
});
