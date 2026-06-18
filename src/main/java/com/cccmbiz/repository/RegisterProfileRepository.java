package com.cccmbiz.repository;

import com.cccmbiz.domain.RegisterProfile;
import com.cccmbiz.dto.RegisterProfileResult;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.List;

@ApplicationScoped
public class RegisterProfileRepository implements PanacheRepository<RegisterProfile> {

    @ConfigProperty(name = "meal.event.id", defaultValue = "89")
    int defaultEventId;

    @SuppressWarnings("unchecked")
    public RegisterProfileResult getRegisterProfile(Integer profileId, Integer eventId) {
        List<Object[]> rows = getEntityManager()
                .createNativeQuery("""
                        SELECT rp.profile_id, rp.register_id
                        FROM register_profile rp
                        JOIN register r ON r.id = rp.register_id
                        WHERE r.event_id = ?1 AND rp.profile_id = ?2
                        ORDER BY r.last_update DESC
                        LIMIT 1
                        """)
                .setParameter(1, eventId)
                .setParameter(2, profileId)
                .getResultList();

        if (rows.isEmpty()) return null;
        Object[] row = rows.get(0);
        return new RegisterProfileResult(((Number) row[0]).intValue(), ((Number) row[1]).intValue());
    }

    public RegisterProfileResult getRegisterProfile(Integer profileId) {
        return getRegisterProfile(profileId, defaultEventId);
    }
}
