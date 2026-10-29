import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation.js';
import { databaseOptions } from './database.options.js';

// Used by the TypeORM CLI to run migrations.
export default new DataSource(databaseOptions(validateEnv(process.env)));
