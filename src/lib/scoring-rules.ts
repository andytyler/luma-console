export type ScoreStatus = 'needs_review' | 'approve_candidate' | 'reject_candidate' | 'pool';

export type ScoreCalculation = {
  label: string;
  delta: number;
  detail: string;
};

export type ScoreReason = {
  total: number;
  raw_total: number;
  status: ScoreStatus;
  positive: string[];
  negative: string[];
  calculations: ScoreCalculation[];
  signals: Record<string, number | string | boolean>;
};

export type ScoreAnswer = {
  question: string;
  answer: string | null;
};

export type ScoreInput = {
  currentTitle: string | null;
  currentCompany: string | null;
  githubUsername: string | null;
  contributionTotal: number | null;
  publicRepos: number | null;
  followers: number | null;
  priorAttendedCount: number;
  answers: ScoreAnswer[];
};

const relevantTitlePattern =
  /(engineer|developer|founder|cto|technical|software|ai|ml|machine learning|research|product|designer|builder|agent|infra|platform|data)/i;
const vendorPattern = /(sales|account executive|business development|recruiter|talent|agency|marketing|lead generation)/i;
const vaguePattern = /^(n\/a|na|none|no|yes|maybe|tbd|not sure|\.|-)?$/i;

export function scoreStatus(score: number): ScoreStatus {
  if (score >= 78) return 'approve_candidate';
  if (score >= 58) return 'pool';
  if (score >= 38) return 'needs_review';
  return 'reject_candidate';
}

function substantialAnswerCount(answers: ScoreAnswer[]) {
  return answers.filter((answer) => {
    const value = String(answer.answer ?? '').trim();
    return value.length >= 30 && !vaguePattern.test(value);
  }).length;
}

export function calculateGuestScore(input: ScoreInput): ScoreReason {
  let score = 35;
  const positive: string[] = [];
  const negative: string[] = [];
  const calculations: ScoreCalculation[] = [
    {
      label: 'Base',
      delta: 35,
      detail: 'Every guest starts at 35.'
    }
  ];
  const answerText = input.answers.map((answer) => `${answer.question}: ${answer.answer ?? ''}`).join('\n');
  const title = input.currentTitle ?? '';
  const titleSignals = [title, answerText].filter(Boolean).join('\n');

  if (input.priorAttendedCount > 0) {
    const delta = Math.min(25, input.priorAttendedCount * 15);
    score += delta;
    positive.push(`Prior checked-in attendance: ${input.priorAttendedCount}`);
    calculations.push({
      label: 'Prior attendance',
      delta,
      detail: `${input.priorAttendedCount} checked-in prior event(s), capped at +25.`
    });
  }

  if (relevantTitlePattern.test(titleSignals)) {
    score += 15;
    positive.push(title ? `Relevant title: ${title}` : 'Relevant title or role in registration answers');
    calculations.push({
      label: 'Relevant role',
      delta: 15,
      detail: title || 'Relevant role found in registration answers.'
    });
  }

  if (vendorPattern.test(title) || vendorPattern.test(answerText)) {
    score -= 20;
    negative.push('Sales/recruiting/vendor signal');
    calculations.push({
      label: 'Vendor signal',
      delta: -20,
      detail: 'Sales, recruiting, agency, marketing, or lead-gen language matched.'
    });
  }

  const substantialAnswers = substantialAnswerCount(input.answers);
  if (substantialAnswers >= 2) {
    score += 18;
    positive.push('Specific registration answers');
    calculations.push({
      label: 'Specific answers',
      delta: 18,
      detail: `${substantialAnswers} substantial registration answers.`
    });
  } else if (substantialAnswers === 0) {
    score -= 12;
    negative.push('Sparse or vague registration answers');
    calculations.push({
      label: 'Sparse answers',
      delta: -12,
      detail: 'No substantial registration answers.'
    });
  }

  const contributions = Number(input.contributionTotal ?? 0);
  if (contributions >= 500) {
    score += 20;
    positive.push('Strong GitHub contribution activity');
    calculations.push({
      label: 'GitHub activity',
      delta: 20,
      detail: `${contributions} contributions, threshold >= 500.`
    });
  } else if (contributions >= 100) {
    score += 12;
    positive.push('Some GitHub contribution activity');
    calculations.push({
      label: 'GitHub activity',
      delta: 12,
      detail: `${contributions} contributions, threshold >= 100.`
    });
  } else if (input.githubUsername) {
    score += 4;
    positive.push('GitHub profile found');
    calculations.push({
      label: 'GitHub profile',
      delta: 4,
      detail: `Profile found: ${input.githubUsername}.`
    });
  } else {
    score -= 8;
    negative.push('No GitHub profile found yet');
    calculations.push({
      label: 'Missing GitHub',
      delta: -8,
      detail: 'No GitHub profile has been found.'
    });
  }

  if (input.currentCompany) {
    score += 5;
    positive.push(`Company identified: ${input.currentCompany}`);
    calculations.push({
      label: 'Company',
      delta: 5,
      detail: input.currentCompany
    });
  }

  const rawTotal = score;
  const total = Math.max(0, Math.min(100, Math.round(score)));
  return {
    total,
    raw_total: rawTotal,
    status: scoreStatus(total),
    positive,
    negative,
    calculations,
    signals: {
      prior_attended_count: input.priorAttendedCount,
      contribution_total: contributions,
      public_repos: Number(input.publicRepos ?? 0),
      followers: Number(input.followers ?? 0),
      substantial_answers: substantialAnswers
    }
  };
}
