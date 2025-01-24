// Based on https://gist.github.com/Hornwitser/f291638024e7e3c0271b1f3a4723e05a
// Replaced node APIs with browser APIs

import { buf as crc32 } from "./crc32.min.mjs";

class Parser {
    constructor(buf) {
        this.data = new DataView(buf);
        this.pos = 0;
        this.last_position = { x: 0, y: 0 };
    }
}

function read_bool(parser) {
    let value = read_uint8(parser) !== 0;
    return value;
}

function read_uint8(parser) {
    let value = parser.data.getUint8(parser.pos);
    parser.pos += 1;
    return value;
}

function read_int16(parser) {
    let value = parser.data.getInt16(parser.pos, true);
    parser.pos += 2;
    return value;
}

function read_uint16(parser) {
    let value = parser.data.getUint16(parser.pos, true);
    parser.pos += 2;
    return value;
}

function read_int32(parser) {
    let value = parser.data.getInt32(parser.pos, true);
    parser.pos += 4;
    return value;
}

function read_uint32(parser) {
    let value = parser.data.getUint32(parser.pos, true);
    parser.pos += 4;
    return value;
}

function read_uint32so(parser) {
    let value = read_uint8(parser);
    if (value === 0xff) {
        return read_uint32(parser);
    }

    return value;
}

function read_float(parser) {
    let value = parser.data.getFloat32(parser.pos, true);
    parser.pos += 4;
    return value;
}

function read_double(parser) {
    let value = parser.data.getFloat64(parser.pos, true);
    parser.pos += 8;
    return value;
}

function read_string(parser) {
    let size = read_uint32so(parser);
    let data = parser.data.buffer.slice(parser.pos, parser.pos + size);
    parser.pos += size;
    return new TextDecoder("utf-8").decode(data);
}

function read_optional(parser, read_value) {
    let load = read_uint8(parser) !== 0;
    if (!load) {
        return null;
    }
    return read_value(parser);
}

function read_array(parser, read_item) {
    let size = read_uint32so(parser);

    let array = [];
    for (let i = 0; i < size; i++) {
        let item = read_item(parser);
        array.push(item);
    }

    return array;
}

function read_dict(parser, read_key, read_value) {
    let size = read_uint32so(parser);

    let mapping = new Map();
    for (let i = 0; i < size; i++) {
        let key = read_key(parser);
        let value = read_value(parser);
        mapping.set(key, value);
    }

    return mapping;
}

function read_version(parser) {
    let major = read_uint16(parser);
    let minor = read_uint16(parser);
    let patch = read_uint16(parser);
    let developer = read_uint16(parser);
    return [major, minor, patch, developer];
}

function read_frequency_size_richness(parser) {
    return {
        frequency: read_float(parser),
        size: read_float(parser),
        richness: read_float(parser),
    }
}

function read_autoplace_setting(parser) {
    return {
        treat_missing_as_default: read_bool(parser),
        settings: map_to_object(read_dict(parser, read_string, read_frequency_size_richness)),
    };
}

function read_map_position(parser) {
    let x, y;
    let x_diff = read_int16(parser) / 256;
    if (x_diff === 0x7fff / 256) {
        x = read_int32(parser) / 256;
        y = read_int32(parser) / 256;
    } else {
        let y_diff = read_int16(parser) / 256;
        x = parser.last_position.x + x_diff;
        y = parser.last_position.y + y_diff;
    }
    parser.last_position.x = x;
    parser.last_position.x = y;
    return { x, y };
}

function read_bounding_box(parser) {
    return {
        left_top: read_map_position(parser),
        right_bottom: read_map_position(parser),
        orientation: {
            x: read_int16(parser),
            y: read_int16(parser)
        },
    };
}

function read_cliff_settings(parser, atLeastV2) {
    let settings = {
        name: read_string(parser)
    };

    if (atLeastV2)
        settings._unknown = read_uint8(parser);

    settings.cliff_elevation_0 = read_float(parser);
    settings.cliff_elevation_interval = read_float(parser);
    settings.richness = read_float(parser);
    
    if (atLeastV2)
        settings.cliff_smoothing = read_float(parser)

    return settings;
}

function read_territory_settings(parser) {
    const units = read_array(parser, read_string);
    const territory_index_expression = read_string(parser);
    const territory_variation_expresion = read_string(parser);
    const minimum_territory_size = read_uint32(parser);
    return {
        units: units,
        territory_index_expression: territory_index_expression,
        territory_variation_expresion: territory_variation_expresion,
        minimum_territory_size: minimum_territory_size
    }
}

function map_to_object(map) {
    let obj = {};
    for (let [key, value] of map) {
        obj[key] = value;
    }
    return obj;
}

function read_map_gen_settings(parser, atLeastV2) {
    const terrain_segmentation = atLeastV2 ? 0 : read_float(parser);
    const water = atLeastV2 ? 0 : read_float(parser);
    const autoplace_controls = map_to_object(read_dict(parser, read_string, read_frequency_size_richness));
    const autoplace_settings = map_to_object(read_dict(parser, read_string, read_autoplace_setting));
    const default_enable_all_autoplace_controls = read_bool(parser);
    const seed = read_uint32(parser);
    const width = read_uint32(parser);
    const height = read_uint32(parser);
    const area_to_generate_at_start = read_bounding_box(parser);
    const starting_area = read_float(parser);
    const peaceful_mode = read_bool(parser);
    const no_enemies_mode = atLeastV2 ? read_bool(parser) : false;
    const starting_points = read_array(parser, read_map_position);
    const property_expression_names = map_to_object(read_dict(parser, read_string, read_string));
    const cliff_settings = read_cliff_settings(parser, atLeastV2);
    const territory_settings = atLeastV2 ? read_optional(parser, read_territory_settings) : null;
    let settings = {
        autoplace_controls: autoplace_controls,
        autoplace_settings: autoplace_settings,
        default_enable_all_autoplace_controls: default_enable_all_autoplace_controls,
        seed: seed,
        width: width,
        height: height,
        area_to_generate_at_start: area_to_generate_at_start,
        starting_area: starting_area,
        peaceful_mode: peaceful_mode,
        starting_points: starting_points,
        property_expression_names: property_expression_names,
        cliff_settings: cliff_settings,
    };
    if (atLeastV2) {
        settings.no_enemies_mode = no_enemies_mode;
        settings._territory_settings = "Maybe broken? Let me know on Github if you can explain what territory_settings is";
        if (territory_settings !== null)
            settings.territory_settings = territory_settings;
    } else {
        settings.terrain_segmentation = terrain_segmentation;
        settings.water = water;
    }

    return settings;
}

function read_pollution(parser) {
    return {
        enabled: read_optional(parser, read_bool),
        diffusion_ratio: read_optional(parser, read_double),
        min_to_diffuse: read_optional(parser, read_double),
        ageing: read_optional(parser, read_double),
        expected_max_per_chunk: read_optional(parser, read_double),
        min_to_show_per_chunk: read_optional(parser, read_double),
        min_pollution_to_damage_trees: read_optional(parser, read_double),
        pollution_with_max_forest_damage: read_optional(parser, read_double),
        pollution_per_tree_damage: read_optional(parser, read_double),
        pollution_restored_per_tree_damage: read_optional(parser, read_double),
        max_pollution_to_restore_trees: read_optional(parser, read_double),
        enemy_attack_pollution_consumption_modifier: read_optional(parser, read_double),
    };
}

function read_real_steering(parser) {
    return {
        radius: read_optional(parser, read_double),
        separation_factor: read_optional(parser, read_double),
        separation_force: read_optional(parser, read_double),
        force_unit_fuzzy_goto_behavior: read_optional(parser, read_bool),
    };

}

function read_steering(parser) {
    return {
        default: read_real_steering(parser),
        moving: read_real_steering(parser),
    };
}

function read_enemy_evolution(parser) {
    return {
        enabled: read_optional(parser, read_bool),
        time_factor: read_optional(parser, read_double),
        destroy_factor: read_optional(parser, read_double),
        pollution_factor: read_optional(parser, read_double),
    };
}

function read_enemy_expansion(parser) {
    return {
        enabled: read_optional(parser, read_bool),
        max_expansion_distance: read_optional(parser, read_uint32),
        friendly_base_influence_radius: read_optional(parser, read_uint32),
        enemy_building_influence_radius: read_optional(parser, read_uint32),
        building_coefficient: read_optional(parser, read_double),
        other_base_coefficient: read_optional(parser, read_double),
        neighbouring_chunk_coefficient: read_optional(parser, read_double),
        neighbouring_base_chunk_coefficient: read_optional(parser, read_double),
        max_colliding_tiles_coefficient: read_optional(parser, read_double),
        settler_group_min_size: read_optional(parser, read_uint32),
        settler_group_max_size: read_optional(parser, read_uint32),
        min_expansion_cooldown: read_optional(parser, read_uint32),
        max_expansion_cooldown: read_optional(parser, read_uint32),
    };
}

function read_unit_group(parser) {
    return {
        min_group_gathering_time: read_optional(parser, read_uint32),
        max_group_gathering_time: read_optional(parser, read_uint32),
        max_wait_time_for_late_members: read_optional(parser, read_uint32),
        max_group_radius: read_optional(parser, read_double),
        min_group_radius: read_optional(parser, read_double),
        max_member_speedup_when_behind: read_optional(parser, read_double),
        max_member_slowdown_when_ahead: read_optional(parser, read_double),
        max_group_slowdown_factor: read_optional(parser, read_double),
        max_group_member_fallback_factor: read_optional(parser, read_double),
        member_disown_distance: read_optional(parser, read_double),
        tick_tolerance_when_member_arrives: read_optional(parser, read_uint32),
        max_gathering_unit_groups: read_optional(parser, read_uint32),
        max_unit_group_size: read_optional(parser, read_uint32),
    };
}

function read_path_finder(parser) {
    return {
        fwd2bwd_ratio: read_optional(parser, read_int32),
        goal_pressure_ratio: read_optional(parser, read_double),
        use_path_cache: read_optional(parser, read_bool),
        max_steps_worked_per_tick: read_optional(parser, read_double),
        max_work_done_per_tick: read_optional(parser, read_uint32),
        short_cache_size: read_optional(parser, read_uint32),
        long_cache_size: read_optional(parser, read_uint32),
        short_cache_min_cacheable_distance: read_optional(parser, read_double),
        short_cache_min_algo_steps_to_cache: read_optional(parser, read_uint32),
        long_cache_min_cacheable_distance: read_optional(parser, read_double),
        cache_max_connect_to_cache_steps_multiplier: read_optional(parser, read_uint32),
        cache_accept_path_start_distance_ratio: read_optional(parser, read_double),
        cache_accept_path_end_distance_ratio: read_optional(parser, read_double),
        negative_cache_accept_path_start_distance_ratio: read_optional(parser, read_double),
        negative_cache_accept_path_end_distance_ratio: read_optional(parser, read_double),
        cache_path_start_distance_rating_multiplier: read_optional(parser, read_double),
        cache_path_end_distance_rating_multiplier: read_optional(parser, read_double),
        stale_enemy_with_same_destination_collision_penalty: read_optional(parser, read_double),
        ignore_moving_enemy_collision_distance: read_optional(parser, read_double),
        enemy_with_different_destination_collision_penalty: read_optional(parser, read_double),
        general_entity_collision_penalty: read_optional(parser, read_double),
        general_entity_subsequent_collision_penalty: read_optional(parser, read_double),
        extended_collision_penalty: read_optional(parser, read_double),
        max_clients_to_accept_any_new_request: read_optional(parser, read_uint32),
        max_clients_to_accept_short_new_request: read_optional(parser, read_uint32),
        direct_distance_to_consider_short_request: read_optional(parser, read_uint32),
        short_request_max_steps: read_optional(parser, read_uint32),
        short_request_ratio: read_optional(parser, read_double),
        min_steps_to_check_path_find_termination: read_optional(parser, read_uint32),
        start_to_goal_cost_multiplier_to_terminate_path_find: read_optional(parser, read_double),
        overload_levels: read_optional(parser, (p) => read_array(p, read_uint32)),
        overload_multipliers: read_optional(parser, (p) => read_array(p, read_double)),
        negative_path_cache_delay_interval: read_optional(parser, read_uint32),
    };
}

function read_difficulty_settings(parser, atLeastV2) {
    if (atLeastV2) {
        return {
            technology_price_multiplier: read_double(parser),
            spoil_time_modifier: read_double(parser),
        };
    }
    return {
        recipe_difficulty: read_uint8(parser),
        technology_difficulty: read_uint8(parser),
        technology_price_multiplier: read_double(parser),
        research_queue_setting: ["always", "after-victory", "never"][read_uint8(parser)],
    };
}

function read_asteroids_settings(parser) {
    return {
        spawning_rate: read_optional(parser, read_double),
        max_ray_portals_expanded_per_tick: read_optional(parser, read_uint32)
    }
}

function read_map_settings(parser, atLeastV2) {
    let settings = {
        pollution: read_pollution(parser),
        steering: read_steering(parser),
        enemy_evolution: read_enemy_evolution(parser),
        enemy_expansion: read_enemy_expansion(parser),
        unit_group: read_unit_group(parser),
        path_finder: read_path_finder(parser),
        max_failed_behavior_count: read_uint32(parser),
        difficulty_settings: read_difficulty_settings(parser, atLeastV2)
    };

    if (atLeastV2)
        settings.asteroids = read_asteroids_settings(parser);

    return settings;
}

async function decompress(buffer) {
    const stream = new Blob([buffer]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream("deflate"));

    const chunks = [];
    for await (const chunk of decompressedStream) {
        chunks.push(chunk);
    }

    return await new Blob(chunks).arrayBuffer();
}

function isValidChecksum(buffer) {
    const crcIndex = buffer.byteLength - 4;
    const data = new Uint8Array(buffer, 0, crcIndex);
    const actual = new DataView(buffer).getUint32(crcIndex, true);
    // Convert signed checksum to unsigned as per https://github.com/SheetJS/js-crc32?tab=readme-ov-file#signed-integers
    const expected = crc32(data) >>> 0;
    
    return expected == actual;
}

export async function parse(exchangeStr) {
    const err = (msg) => { return { error: msg }; };

    exchangeStr = exchangeStr.replace(/\s+/g, "");
    if (!/>>>[0-9a-zA-Z\/+]+={0,3}<<</.test(exchangeStr)) {
        return err("Invalid exchange string");
    }

    let buffer = Uint8Array.from(atob(exchangeStr.slice(3, -3)), c => c.charCodeAt(0));

    try {
        buffer = await decompress(buffer);
    }
    catch (e) {
        return err("Invalid or unsupported (pre v0.16) exchange string");
    }

    const parser = new Parser(buffer);
    const version = read_version(parser);
    const atLeastV2 = version >= [2, 0, 0, 0];

    const data = {
        version: version,
        unknown: read_uint8(parser),
        mapGenSettings: read_map_gen_settings(parser, atLeastV2),
        mapSettings: read_map_settings(parser, atLeastV2),
        checksum: read_uint32(parser),
    };

    if (parser.pos != buffer.byteLength) {
        return err("Unexpected data after end");
    }

    const crcMsg = isValidChecksum(buffer) ? null : "Checksum failed";
    if (crcMsg !== null) {
        data.warning = crcMsg;
    }

    return data;
}
