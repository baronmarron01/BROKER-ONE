const REGULATED = new Set(['medical', 'financial', 'legal', 'real_estate', 'pharmaceutical', 'weapons']);
const LICENSED = new Set(['medical', 'legal', 'real_estate', 'electrical', 'pharmaceutical']);

const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const text = value => String(value ?? '').trim();

export function validateRequest(input) {
  const errors = [];
  const description = text(input.description);
  const category = text(input.category).toLowerCase();
  if (description.length < 10 || description.length > 4000) errors.push('description must contain 10 to 4000 characters');
  if (!category || category.length > 80) errors.push('category is required and must be at most 80 characters');
  for (const field of ['min_budget', 'max_budget']) {
    if (input[field] != null && (!Number.isFinite(Number(input[field])) || Number(input[field]) < 0)) errors.push(`${field} must be a non-negative number`);
  }
  if (input.min_budget != null && input.max_budget != null && Number(input.min_budget) > Number(input.max_budget)) errors.push('min_budget cannot exceed max_budget');
  if (input.currency && !/^[A-Z]{3}$/.test(input.currency)) errors.push('currency must be a 3-letter uppercase code');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: {
    description,
    category,
    min_budget: input.min_budget == null ? null : Number(input.min_budget),
    max_budget: input.max_budget == null ? null : Number(input.max_budget),
    currency: input.currency || 'CAD',
    location: text(input.location),
    requires_physical_presence: Boolean(input.requires_physical_presence),
    requires_inspection: Boolean(input.requires_inspection),
    requires_installation: Boolean(input.requires_installation),
    requires_licensed_professional: Boolean(input.requires_licensed_professional),
    regulated_override: input.regulated_override == null ? null : Boolean(input.regulated_override)
  }};
}

export function classifyRequest(request) {
  const regulatedText = /médic|medic|chirurg|pharma|injection|injectable|botox|ordonnance|prescription|juridique|avocat|hypoth[eè]que|armes? à feu/i.test(request.description || '');
  const isRegulatedSector = request.regulated_override === true || REGULATED.has(request.category) || regulatedText;
  const requiresLicensedProfessional = request.requires_licensed_professional || LICENSED.has(request.category);
  const physical = request.requires_physical_presence || request.requires_inspection || request.requires_installation;
  const pipelineClass = isRegulatedSector || requiresLicensedProfessional ? 'C' : physical ? 'B' : 'A';
  const approvalGates = [];
  if (pipelineClass !== 'A') approvalGates.push('before_provider_contact', 'before_contract');
  if (pipelineClass === 'C') approvalGates.push('before_payment', 'compliance_review');
  const riskAxes = {
    regulatory: isRegulatedSector || requiresLicensedProfessional ? 'high' : 'low',
    physical: physical ? 'medium' : 'low',
    financial: (request.max_budget || 0) >= 10_000 ? 'high' : (request.max_budget || 0) >= 1_000 ? 'medium' : 'low',
    reversibility: request.requires_installation ? 'low' : 'medium'
  };
  return {
    pipeline_class: pipelineClass,
    processing_mode: pipelineClass === 'A' ? 'ASSISTED_AUTOMATION' : 'SUPERVISED',
    flags: {
      is_regulated_sector: isRegulatedSector,
      requires_physical_presence: request.requires_physical_presence,
      requires_inspection: request.requires_inspection,
      requires_installation: request.requires_installation,
      requires_licensed_professional: requiresLicensedProfessional
    },
    risk_axes: riskAxes,
    approval_gates: approvalGates,
    disclaimer: 'Classification operational only; it is not a legal determination.'
  };
}

export function scoreCandidate(request, candidate) {
  const semantic = clamp(candidate.semantic_score);
  const capability = clamp(candidate.capability_score);
  const constraints = candidate.eligible === false ? 0 : clamp(candidate.constraint_score ?? 1);
  const location = clamp(candidate.location_score ?? (candidate.delivers_to_location ? 1 : 0.4));
  const min = request.min_budget;
  const max = request.max_budget;
  const price = candidate.total_price == null ? NaN : Number(candidate.total_price);
  let priceScore = 0.5;
  if (Number.isFinite(price) && min != null && max != null) {
    if (price >= min && price <= max) priceScore = 1;
    else {
      const distance = price < min ? min - price : price - max;
      priceScore = clamp(1 - distance / Math.max(max - min, max, 1));
    }
  }
  const priorTransactions = Math.max(0, Number(candidate.total_transactions || 0));
  const successes = Math.max(0, Math.min(priorTransactions, Number(candidate.successful_transactions || 0)));
  const bayesianSuccess = (successes + 3) / (priorTransactions + 5);
  const rating = clamp((Number(candidate.rating || 0) / 5));
  const confidence = clamp((0.65 * bayesianSuccess) + (0.35 * (candidate.rating == null ? 0.6 : rating)));
  const weights = { semantic: 0.30, price: 0.25, location: 0.15, capability: 0.20, constraints: 0.10 };
  const relevance = semantic * weights.semantic + priceScore * weights.price + location * weights.location + capability * weights.capability + constraints * weights.constraints;
  const unverified = candidate.external === true || String(candidate.provider_id || '').startsWith('external:') || ['pending','unverified_candidate','rejected','suspended'].includes(candidate.verification_status);
  const eligible = constraints > 0 && candidate.eligible !== false && !unverified;
  return {
    provider_id: text(candidate.provider_id) || 'unknown',
    name: text(candidate.name) || 'Unnamed provider',
    eligible,
    score: eligible ? Number((relevance * (0.85 + 0.15 * confidence)).toFixed(4)) : 0,
    confidence: candidate.total_transactions == null && candidate.rating == null ? null : Number(confidence.toFixed(4)),
    subscores: { semantic, price: Number(priceScore.toFixed(4)), location, capability, constraints },
    explanation: unverified ? 'Résultat de découverte non qualifié : vérification requise avant tout classement commercial.' : eligible ? 'Classement indicatif selon les données fournies ; disponibilité et offre à confirmer.' : 'Exclu : une contrainte obligatoire n’est pas satisfaite.'
  };
}

export function rankCandidates(request, candidates) {
  return candidates.map(candidate => scoreCandidate(request, candidate))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
