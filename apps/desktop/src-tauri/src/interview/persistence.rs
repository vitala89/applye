//! Interview stage and prep-card SQL.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InterviewStage {
    pub id: i64,
    pub application_id: i64,
    pub stage_order: i64,
    pub stage_type: String,
    pub stage_label: String,
    pub scheduled_at: Option<String>,
    pub status: String,
    pub stage_language: Option<String>,
    pub interviewer_name: Option<String>,
    pub interviewer_role: Option<String>,
    pub interviewer_email: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInterviewStageInput {
    pub application_id: i64,
    pub stage_order: i64,
    pub stage_type: String,
    pub stage_label: String,
    pub scheduled_at: Option<String>,
    pub stage_language: Option<String>,
    pub interviewer_name: Option<String>,
    pub interviewer_role: Option<String>,
    pub interviewer_email: Option<String>,
    pub notes: Option<String>,
}

/// Partial patch - every field but `stageId` is optional; an absent field
/// keeps its current value.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInterviewStageInput {
    pub stage_id: i64,
    pub stage_order: Option<i64>,
    pub stage_type: Option<String>,
    pub stage_label: Option<String>,
    pub scheduled_at: Option<String>,
    pub status: Option<String>,
    pub stage_language: Option<String>,
    pub interviewer_name: Option<String>,
    pub interviewer_role: Option<String>,
    pub interviewer_email: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InterviewPrepCard {
    pub id: i64,
    pub stage_id: i64,
    pub format: String,
    pub language: String,
    pub question: Option<String>,
    pub answer: Option<String>,
    pub star_situation: Option<String>,
    pub star_task: Option<String>,
    pub star_action: Option<String>,
    pub star_result: Option<String>,
    pub star_reflection: Option<String>,
    pub input_hash: String,
    pub model_used: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPrepCardInput {
    pub question: Option<String>,
    pub answer: Option<String>,
    pub star_situation: Option<String>,
    pub star_task: Option<String>,
    pub star_action: Option<String>,
    pub star_result: Option<String>,
    pub star_reflection: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveInterviewPrepBatchInput {
    pub stage_id: i64,
    pub format: String,
    pub language: String,
    pub input_hash: String,
    pub model_used: String,
    pub cards: Vec<NewPrepCardInput>,
}

pub(crate) async fn insert_stage(
    input: &CreateInterviewStageInput,
    status: &str,
    pool: &SqlitePool,
) -> Result<i64, String> {
    let id = sqlx::query(
        "INSERT INTO interview_stages
           (application_id, stage_order, stage_type, stage_label, scheduled_at, status,
            stage_language, interviewer_name, interviewer_role, interviewer_email, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(input.application_id)
    .bind(input.stage_order)
    .bind(&input.stage_type)
    .bind(&input.stage_label)
    .bind(&input.scheduled_at)
    .bind(status)
    .bind(&input.stage_language)
    .bind(&input.interviewer_name)
    .bind(&input.interviewer_role)
    .bind(&input.interviewer_email)
    .bind(&input.notes)
    .execute(pool)
    .await
    .map_err(|e| format!("create_interview_stage: {e}"))?
    .last_insert_rowid();
    Ok(id)
}

pub(crate) struct StageUpdate<'a> {
    pub stage_order: i64,
    pub stage_type: &'a str,
    pub stage_label: &'a str,
    pub scheduled_at: &'a Option<String>,
    pub status: &'a str,
    pub stage_language: &'a Option<String>,
    pub interviewer_name: &'a Option<String>,
    pub interviewer_role: &'a Option<String>,
    pub interviewer_email: &'a Option<String>,
    pub notes: &'a Option<String>,
}

pub(crate) async fn update_stage(
    stage_id: i64,
    fields: StageUpdate<'_>,
    pool: &SqlitePool,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE interview_stages SET
           stage_order = ?, stage_type = ?, stage_label = ?, scheduled_at = ?, status = ?,
           stage_language = ?, interviewer_name = ?, interviewer_role = ?,
           interviewer_email = ?, notes = ?
         WHERE id = ?",
    )
    .bind(fields.stage_order)
    .bind(fields.stage_type)
    .bind(fields.stage_label)
    .bind(fields.scheduled_at)
    .bind(fields.status)
    .bind(fields.stage_language)
    .bind(fields.interviewer_name)
    .bind(fields.interviewer_role)
    .bind(fields.interviewer_email)
    .bind(fields.notes)
    .bind(stage_id)
    .execute(pool)
    .await
    .map_err(|e| format!("update_interview_stage: {e}"))?;
    Ok(())
}

pub(crate) async fn delete_stage(stage_id: i64, pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("DELETE FROM interview_stages WHERE id = ?")
        .bind(stage_id)
        .execute(pool)
        .await
        .map_err(|e| format!("delete_interview_stage: {e}"))?;
    Ok(())
}

pub(crate) async fn list_stages(
    application_id: i64,
    pool: &SqlitePool,
) -> Result<Vec<InterviewStage>, String> {
    sqlx::query_as::<_, InterviewStage>(
        "SELECT * FROM interview_stages WHERE application_id = ? ORDER BY stage_order ASC, id ASC",
    )
    .bind(application_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list_interview_stages: {e}"))
}

pub(crate) async fn fetch_stage(pool: &SqlitePool, id: i64) -> Result<InterviewStage, String> {
    sqlx::query_as::<_, InterviewStage>("SELECT * FROM interview_stages WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("fetch_stage: {e}"))
}

pub(crate) async fn list_prep(
    stage_id: i64,
    pool: &SqlitePool,
) -> Result<Vec<InterviewPrepCard>, String> {
    sqlx::query_as::<_, InterviewPrepCard>(
        "SELECT * FROM interview_prep WHERE stage_id = ? ORDER BY id ASC",
    )
    .bind(stage_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list_interview_prep: {e}"))
}

pub(crate) async fn insert_prep_card(
    input: &SaveInterviewPrepBatchInput,
    card: &NewPrepCardInput,
    pool: &SqlitePool,
) -> Result<i64, String> {
    let id = sqlx::query(
        "INSERT INTO interview_prep
           (stage_id, format, language, question, answer,
            star_situation, star_task, star_action, star_result, star_reflection,
            input_hash, model_used, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
    )
    .bind(input.stage_id)
    .bind(&input.format)
    .bind(&input.language)
    .bind(&card.question)
    .bind(&card.answer)
    .bind(&card.star_situation)
    .bind(&card.star_task)
    .bind(&card.star_action)
    .bind(&card.star_result)
    .bind(&card.star_reflection)
    .bind(&input.input_hash)
    .bind(&input.model_used)
    .execute(pool)
    .await
    .map_err(|e| format!("save_interview_prep_batch: {e}"))?
    .last_insert_rowid();
    Ok(id)
}

pub(crate) async fn fetch_prep_card(
    pool: &SqlitePool,
    id: i64,
) -> Result<InterviewPrepCard, String> {
    sqlx::query_as::<_, InterviewPrepCard>("SELECT * FROM interview_prep WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("save_interview_prep_batch reload: {e}"))
}
