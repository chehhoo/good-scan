package com.cccmbiz.repository;

import com.cccmbiz.domain.Profile;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class ProfileRepository implements PanacheRepository<Profile> {

    public Profile findByUid(String uid) {
        return find("uid", uid).firstResult();
    }
}
