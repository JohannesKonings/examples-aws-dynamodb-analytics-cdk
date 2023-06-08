export interface Config {
    isQuicksight: boolean;
    kinesisFormat: 'JSON' | 'PARQUET';
}

export const config: Config = {
    isQuicksight: false,
    kinesisFormat: 'PARQUET',
}