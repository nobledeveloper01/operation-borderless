import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation.js';
import { databaseOptions } from './database.options.js';

// The TypeORM CLI loads this file when it runs or reverts migrations.
export default new DataSource(databaseOptions(validateEnv(process.env)));
