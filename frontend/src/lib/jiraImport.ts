/** Must match backend `app.services.jira_csv_parser.PROJECT_ROOT_ISSUE_KEY`
 * (ADR-036) — the sentinel `external_key` of the synthetic project-summary
 * task the Jira importer creates as the parent of everything else it
 * imports. */
export const JIRA_PROJECT_ROOT_KEY = "__jira_project_root__";
