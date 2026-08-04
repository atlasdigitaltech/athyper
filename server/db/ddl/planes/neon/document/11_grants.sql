REVOKE ALL ON SCHEMA document FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA document FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA document FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA document TO athyperapp;
        GRANT SELECT ON
            document.active_attachment,
            document.active_comment
        TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            document.attachment,
            document.attachment_folder,
            document.attachment_link,
            document.comment,
            document.comment_draft,
            document.comment_feed_cursor,
            document.content_item,
            document.conversation,
            document.conversation_participant,
            document.multipart_upload
        TO athyperapp;
        GRANT SELECT, INSERT, DELETE ON
            document.comment_mention,
            document.comment_reaction,
            document.content_item_link
        TO athyperapp;
        GRANT SELECT, INSERT ON snapshot.content_item_version TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA document TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA document TO athyperadmin;
        GRANT ALL PRIVILEGES ON snapshot.content_item_version TO athyperadmin;
    END IF;
END;
$$;
