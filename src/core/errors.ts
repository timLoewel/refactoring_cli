import type { Result, ResultAsync } from "neverthrow";

export interface ParamError {
  kind: "param";
  param: string;
  message: string;
}

export interface ProjectError {
  kind: "project";
  message: string;
}

export interface RegistryError {
  kind: "registry";
  message: string;
}

export interface ConnectionError {
  kind: "connection";
  message: string;
}

export interface FixtureError {
  kind: "fixture";
  message: string;
}

export type CoreError = ParamError | ProjectError | RegistryError | ConnectionError;

export type ParamResult<T> = Result<T, ParamError>;
export type ProjectResult<T> = Result<T, ProjectError>;
export type RegistryResult<T> = Result<T, RegistryError>;
export type ConnectionResult<T> = ResultAsync<T, ConnectionError>;
export type FixtureResult<T> = Result<T, FixtureError>;
